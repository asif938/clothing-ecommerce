import { Injectable, Logger } from "@nestjs/common";
import type { Experiment, ExperimentGoal, ExperimentKind } from "@clothing/db";
import {
  assignVariant,
  CONTROL_KEY,
  type AnnouncementTarget,
  type BlockTarget,
  type ExperimentVariant,
  type OfferVariantPayload,
} from "@clothing/shared/personalization";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { CacheService } from "../cache/cache.service";

/** Running experiments are read on every storefront page view — a short cache keeps that to one query per half minute. */
const ACTIVE_CACHE_KEY = "experiments:active";
const RUNNING_CACHE_TTL_SECONDS = 30;
export const EXPERIMENTS_CACHE_TAG = "experiments";

export interface RunningExperiment {
  id: string;
  status: "running" | "paused";
  kind: ExperimentKind;
  goal: ExperimentGoal;
  trafficPercent: number;
  variants: ExperimentVariant[];
  target: unknown;
  startedAt: Date | null;
}

export interface VisitorAssignment {
  experimentId: string;
  kind: ExperimentKind;
  variantKey: string;
  /** Announcement/offer variants carry their content; block variants are rendered server-side from the page payload. */
  payload: unknown;
  target: unknown;
}

export interface BlockExperimentAttachment {
  experimentId: string;
  /** Control first; `props` null = the block's own props. */
  variants: { key: string; props: Record<string, unknown> | null }[];
}

export interface AnnouncementExperimentAttachment {
  experimentId: string;
  variants: { key: string; payload: unknown }[];
}

/**
 * The storefront-facing half of A/B testing (docs/PROJECT_SPEC.md §16 M14),
 * kept free of admin dependencies so the discount engine and cart can use
 * it without import cycles. The visitor id is the API's own httpOnly
 * `anonymous_id` cookie (CustomerContextGuard) — never a client-supplied
 * value — and the variant is recomputed from it on every call
 * (`assignVariant`), so nothing the browser sends can pick a variant.
 */
@Injectable()
export class ExperimentAssignmentsService {
  private readonly logger = new Logger(ExperimentAssignmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly cache: CacheService,
  ) {}

  invalidate(): void {
    this.cache.invalidateTag(EXPERIMENTS_CACHE_TAG);
  }

  /** Running experiments, plus paused offer tests (they still gate their discounts — see `offerGate`). */
  private async active(): Promise<RunningExperiment[]> {
    const cached = this.cache.get<RunningExperiment[]>(ACTIVE_CACHE_KEY);
    if (cached) return cached;
    const rows = await this.prisma.experiment.findMany({
      where: { OR: [{ status: "running" }, { status: "paused", kind: "offer" }] },
      orderBy: { startedAt: "asc" },
    });
    const active = rows.map((row: Experiment) => ({
      id: row.id,
      status: row.status as "running" | "paused",
      kind: row.kind,
      goal: row.goal,
      trafficPercent: row.trafficPercent,
      variants: (row.variants as ExperimentVariant[] | null) ?? [],
      target: row.target,
      startedAt: row.startedAt,
    }));
    this.cache.set(ACTIVE_CACHE_KEY, active, { ttlSeconds: RUNNING_CACHE_TTL_SECONDS, tags: [EXPERIMENTS_CACHE_TAG] });
    return active;
  }

  /** Experiments visitors are currently being split into. Empty while `experiments.enabled` is off (everyone sees the control). */
  async running(): Promise<RunningExperiment[]> {
    if (!(await this.settings.getValue<boolean>("experiments.enabled"))) return [];
    return (await this.active()).filter((e) => e.status === "running");
  }

  async assignmentsFor(visitorId: string): Promise<VisitorAssignment[]> {
    const out: VisitorAssignment[] = [];
    for (const experiment of await this.running()) {
      const key = assignVariant(experiment, visitorId);
      if (key === null) continue;
      const variant = experiment.variants.find((v) => v.key === key);
      out.push({
        experimentId: experiment.id,
        kind: experiment.kind,
        variantKey: key,
        payload: experiment.kind === "block" ? null : (variant?.payload ?? null),
        target: experiment.target,
      });
    }
    return out;
  }

  /** Block experiments for one page, keyed by block id — merged into the public page payload so every variant can be server-rendered. */
  async blockExperimentsForPage(pageId: string): Promise<Map<string, BlockExperimentAttachment>> {
    const map = new Map<string, BlockExperimentAttachment>();
    for (const experiment of await this.running()) {
      if (experiment.kind !== "block") continue;
      const target = experiment.target as BlockTarget | null;
      if (!target || target.pageId !== pageId) continue;
      map.set(target.blockId, {
        experimentId: experiment.id,
        variants: experiment.variants.map((v) => ({
          key: v.key,
          props: v.key === CONTROL_KEY ? null : (((v.payload as { props?: Record<string, unknown> } | undefined)?.props ?? null) as Record<string, unknown> | null),
        })),
      });
    }
    return map;
  }

  async announcementExperiments(): Promise<Map<string, AnnouncementExperimentAttachment>> {
    const map = new Map<string, AnnouncementExperimentAttachment>();
    for (const experiment of await this.running()) {
      if (experiment.kind !== "announcement") continue;
      const target = experiment.target as AnnouncementTarget | null;
      if (!target) continue;
      map.set(target.announcementId, {
        experimentId: experiment.id,
        variants: experiment.variants.map((v) => ({ key: v.key, payload: v.key === CONTROL_KEY ? null : (v.payload ?? null) })),
      });
    }
    return map;
  }

  /**
   * Discounts owned by running offer experiments apply only to visitors
   * whose variant names them. `gated` = every such discount, `allowed` =
   * the ones this visitor may use. A discount outside any offer test is
   * untouched. Visitors outside the test's traffic get the control's offer.
   * A paused test — or every test while `experiments.enabled` is off — keeps
   * gating and gives everyone the control's offer, so pausing never hands
   * every variant's discount to every shopper at once.
   */
  async offerGate(visitorId: string | null): Promise<{ gated: Set<string>; allowed: Set<string> }> {
    const gated = new Set<string>();
    const allowed = new Set<string>();
    const splitting = await this.settings.getValue<boolean>("experiments.enabled");
    for (const experiment of await this.active()) {
      if (experiment.kind !== "offer") continue;
      for (const variant of experiment.variants) {
        const discountId = (variant.payload as OfferVariantPayload | undefined)?.discountId;
        if (discountId) gated.add(discountId);
      }
      const split = splitting && experiment.status === "running" && visitorId;
      const key = (split ? assignVariant(experiment, visitorId) : null) ?? CONTROL_KEY;
      const discountId = (experiment.variants.find((v) => v.key === key)?.payload as OfferVariantPayload | undefined)?.discountId;
      if (discountId) allowed.add(discountId);
    }
    return { gated, allowed };
  }

  /** Records first exposure for each listed running experiment the visitor is actually in (server-computed variant). */
  async recordExposures(visitorId: string, experimentIds: string[]): Promise<{ recorded: number }> {
    const wanted = new Set(experimentIds);
    const rows: { experimentId: string; visitorId: string; variantKey: string }[] = [];
    for (const experiment of await this.running()) {
      if (!wanted.has(experiment.id)) continue;
      const key = assignVariant(experiment, visitorId);
      if (key !== null) rows.push({ experimentId: experiment.id, visitorId, variantKey: key });
    }
    if (rows.length === 0) return { recorded: 0 };
    const result = await this.prisma.experimentExposure.createMany({ data: rows, skipDuplicates: true });
    return { recorded: result.count };
  }

  /**
   * A goal reached by a visitor: credited to every running experiment they
   * were exposed to (or just `onlyExperimentId` for clicks), under the
   * variant recorded at exposure. One row per visitor per goal.
   */
  async recordGoal(visitorId: string, goal: Exclude<ExperimentGoal, "purchase">, onlyExperimentId?: string): Promise<void> {
    const running = await this.running();
    if (running.length === 0) return;
    const ids = running.filter((e) => !onlyExperimentId || e.id === onlyExperimentId).map((e) => e.id);
    if (ids.length === 0) return;
    const exposures = await this.prisma.experimentExposure.findMany({ where: { visitorId, experimentId: { in: ids } }, select: { experimentId: true, variantKey: true } });
    if (exposures.length === 0) return;
    await this.prisma.experimentConversion.createMany({
      data: exposures.map((e) => ({ experimentId: e.experimentId, visitorId, variantKey: e.variantKey, goal, reference: "", value: 0 })),
      skipDuplicates: true,
    });
  }

  /** Fire-and-forget wrapper for request paths (cart) — a tracking failure must never fail the shopper's action. */
  recordGoalQuietly(visitorId: string | null | undefined, goal: Exclude<ExperimentGoal, "purchase">): void {
    if (!visitorId) return;
    void this.recordGoal(visitorId, goal).catch((error: unknown) => this.logger.warn(`Experiment goal ${goal} not recorded: ${error instanceof Error ? error.message : "Unknown error"}`));
  }

  /**
   * Purchase conversions, set-based: every order placed by an exposed
   * visitor after their first exposure counts for each running experiment
   * (whatever its primary goal — revenue is a secondary metric everywhere).
   * Re-scans a short trailing window each run; the unique key makes it
   * idempotent. Cancelled/expired orders don't count.
   */
  async conversionSweep(now = new Date()): Promise<number> {
    const running = await this.running();
    if (running.length === 0) return 0;
    const since = new Date(now.getTime() - 3 * 86_400_000);
    return await this.prisma.$executeRaw`
      INSERT INTO experiment_conversions (id, experiment_id, visitor_id, variant_key, goal, reference, value, created_at)
      SELECT gen_random_uuid()::text, e.experiment_id, e.visitor_id, e.variant_key, 'purchase'::"ExperimentGoal", o.id, o.total, o.created_at
      FROM orders o
      JOIN experiment_exposures e ON e.visitor_id = o.visitor_id AND o.created_at >= e.first_seen_at
      JOIN experiments x ON x.id = e.experiment_id AND x.status = 'running'::"ExperimentStatus"
      WHERE o.visitor_id IS NOT NULL AND o.created_at >= ${since}
        AND o.status::text NOT IN ('cancelled', 'expired')
      ON CONFLICT (experiment_id, visitor_id, goal, reference) DO NOTHING`;
  }
}
