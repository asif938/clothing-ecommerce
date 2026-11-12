import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { RFM_SEGMENT_LABELS, RFM_SEGMENTS, scoreRfm, type RfmSegment } from "@clothing/shared/marketing";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { dhakaDayStart, dhakaParts } from "../common/dhaka-time";
import type { AuthenticatedStaff } from "../common/types";

/** The nightly pass runs after this Dhaka hour, once per Dhaka day. */
const RUN_AFTER_HOUR = 2;

/**
 * RFM segmentation (docs/PROJECT_SPEC.md §5.5 `segments` "RFM", §8.2 "RFM
 * presets in phase 2", §16 M13). Once a day, scores every customer with an
 * order in `crm.rfm.windowDays` (cancelled/expired orders don't count) and
 * writes R/F/M + a named segment onto the customer row, where the segment
 * rule builder can filter on them like any other field. "Already ran today"
 * is read from the data itself (`rfm_scored_at`), so it survives restarts
 * and free-tier hosts that spin down between external cron calls.
 */
@Injectable()
export class RfmService {
  private readonly logger = new Logger(RfmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async runIfDue(now = new Date()): Promise<void> {
    if (!(await this.settings.getValue<boolean>("crm.rfm.enabled"))) return;
    if (dhakaParts(now).hour < RUN_AFTER_HOUR) return;
    const ranToday = await this.prisma.customer.findFirst({ where: { rfmScoredAt: { gte: dhakaDayStart(now) } }, select: { id: true } });
    if (ranToday) return;
    const result = await this.score(now);
    this.logger.log(`RFM scored ${result.scored} customers`);
  }

  async score(now = new Date()): Promise<{ scored: number; cleared: number }> {
    const windowDays = await this.settings.getValue<number>("crm.rfm.windowDays");
    const rows = await this.prisma.$queryRaw<{ customer_id: string; last_order_at: Date; orders: number; spend: bigint | number }[]>`
      SELECT customer_id, MAX(created_at) AS last_order_at, COUNT(*)::int AS orders, COALESCE(SUM(total), 0) AS spend
      FROM orders
      WHERE customer_id IS NOT NULL AND created_at >= ${new Date(now.getTime() - windowDays * 86_400_000)}
        AND status::text NOT IN ('cancelled', 'expired', 'pending_payment')
      GROUP BY customer_id`;

    const scored = scoreRfm(
      rows.map((r) => ({ id: r.customer_id, recencyDays: Math.floor((now.getTime() - r.last_order_at.getTime()) / 86_400_000), frequency: r.orders, monetary: Number(r.spend) })),
    );

    // Group identical score tuples so a big store costs ≤125 UPDATEs, not one per customer.
    const groups = new Map<string, { r: number; f: number; m: number; segment: string; ids: string[] }>();
    for (const s of scored) {
      const key = `${s.r}${s.f}${s.m}${s.segment}`;
      const group = groups.get(key) ?? { r: s.r, f: s.f, m: s.m, segment: s.segment, ids: [] };
      group.ids.push(s.id);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      for (let i = 0; i < group.ids.length; i += 5000) {
        await this.prisma.customer.updateMany({
          where: { id: { in: group.ids.slice(i, i + 5000) } },
          data: { rfmRecency: group.r, rfmFrequency: group.f, rfmMonetary: group.m, rfmSegment: group.segment, rfmScoredAt: now },
        });
      }
    }
    // Everyone not scored in this pass (no qualifying order in the window) loses stale scores; scored rows carry exactly `now`.
    const cleared = await this.prisma.customer.updateMany({
      where: { OR: [{ rfmScoredAt: null }, { rfmScoredAt: { lt: now } }] },
      data: { rfmRecency: null, rfmFrequency: null, rfmMonetary: null, rfmSegment: null, rfmScoredAt: now },
    });
    // Lifetime last-order date (not limited to the window) in one set-based statement.
    await this.prisma.$executeRaw`
      UPDATE customers c SET last_order_at = o.last_at
      FROM (SELECT customer_id, MAX(created_at) AS last_at FROM orders
            WHERE customer_id IS NOT NULL AND status::text NOT IN ('cancelled', 'expired', 'pending_payment')
            GROUP BY customer_id) o
      WHERE c.id = o.customer_id AND c.last_order_at IS DISTINCT FROM o.last_at`;
    return { scored: scored.length, cleared: cleared.count };
  }

  async summary() {
    const [groups, lastRun] = await Promise.all([
      this.prisma.customer.groupBy({ by: ["rfmSegment"], where: { rfmSegment: { not: null }, deletedAt: null }, _count: { _all: true }, _avg: { totalSpent: true } }),
      this.prisma.customer.aggregate({ _max: { rfmScoredAt: true } }),
    ]);
    const bySegment = new Map(groups.map((g) => [g.rfmSegment, g]));
    return {
      lastRunAt: lastRun._max.rfmScoredAt,
      segments: RFM_SEGMENTS.map((segment) => ({
        segment,
        label: RFM_SEGMENT_LABELS[segment],
        customers: bySegment.get(segment)?._count._all ?? 0,
        avgSpent: Math.round(bySegment.get(segment)?._avg.totalSpent ?? 0),
      })),
    };
  }

  /** Creates one dynamic segment per RFM segment that doesn't have one yet (§8.2 "RFM presets"). */
  async createPresets(actor: AuthenticatedStaff, only?: RfmSegment[]) {
    const existing = await this.prisma.segment.findMany({ select: { rules: true } });
    const covered = new Set(
      existing
        .map((s) => (s.rules as { conditions?: { field?: string; op?: string; value?: unknown }[] }).conditions ?? [])
        .filter((c) => c.length === 1 && c[0]!.field === "rfmSegment" && c[0]!.op === "eq")
        .map((c) => String(c[0]!.value)),
    );
    const created: string[] = [];
    for (const segment of only ?? RFM_SEGMENTS) {
      if (covered.has(segment)) continue;
      const rules = { match: "all", conditions: [{ field: "rfmSegment", op: "eq", value: segment }] };
      const memberCountCache = await this.prisma.customer.count({ where: { deletedAt: null, rfmSegment: segment } });
      const row = await this.prisma.segment.create({ data: { name: { bn: `RFM: ${RFM_SEGMENT_LABELS[segment].bn}`, en: `RFM: ${RFM_SEGMENT_LABELS[segment].en}` } as Prisma.InputJsonValue, rules: rules as Prisma.InputJsonValue, isDynamic: true, memberCountCache } });
      await this.audit.record({ actorType: "staff", actorId: actor.id, action: "segment.create", entityType: "segment", entityId: row.id, after: row });
      created.push(segment);
    }
    return { created };
  }
}
