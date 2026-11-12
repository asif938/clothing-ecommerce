import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { OrderStatus, ShipmentStatus } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { StaffNotificationsService } from "../notifications/staff-notifications.service";
import { addDays, dhakaDateKey, dhakaDayStart } from "../common/dhaka-time";
import { isUniqueViolation } from "../common/document-number";
import type { AuthenticatedStaff } from "../common/types";
import { detectAnomalies, mean, type DetectedAnomaly } from "./anomaly";
import { formatTaka } from "./report-catalog";

const CANCELLED_LIKE: OrderStatus[] = ["cancelled", "expired"];
const FINAL_SHIPMENT: ShipmentStatus[] = ["delivered", "partially_delivered", "rejected_at_door", "returned_to_sender"];
const REJECTED_SHIPMENT: ShipmentStatus[] = ["rejected_at_door", "returned_to_sender"];

const METRIC_LABEL: Record<string, { bn: string; en: string }> = {
  orders: { bn: "অর্ডার সংখ্যা", en: "Orders" },
  revenue: { bn: "আয়", en: "Revenue" },
  cancellation_rate: { bn: "বাতিলের হার", en: "Cancellation rate" },
  rejection_rate: { bn: "রিজেকশন হার", en: "Rejection rate" },
};

interface DayBucket {
  orders: number;
  revenue: number;
  cancelled: number;
  finalShipments: number;
  rejectedShipments: number;
}

function fmt(metric: string, value: number): string {
  if (metric === "revenue") return formatTaka(value);
  if (metric.endsWith("_rate")) return `${(value * 100).toFixed(1)}%`;
  return String(Math.round(value * 10) / 10);
}

/** Bilingual alert text — pure so it's easy to read and test. */
export function anomalyMessage(a: DetectedAnomaly, day: string): { bn: string; en: string } {
  const label = METRIC_LABEL[a.metric] ?? { bn: a.metric, en: a.metric };
  const pct = `${Math.round(Math.abs(a.change) * 100)}%`;
  return {
    bn: `${day}: ${label.bn} ${a.direction === "up" ? "বেড়েছে" : "কমেছে"} ${pct} — ${fmt(a.metric, a.observed)} (গড় ${fmt(a.metric, a.expected)})`,
    en: `${day}: ${label.en} ${a.direction === "up" ? "up" : "down"} ${pct} — ${fmt(a.metric, a.observed)} vs ${fmt(a.metric, a.expected)} average`,
  };
}

/**
 * Anomaly alerts (docs/PROJECT_SPEC.md §8.2 Dashboard "alerts (anomalies
 * …)", §16 M12). Once per Dhaka day, compares *yesterday* (a complete day)
 * with the preceding `alerts.anomaly.baselineDays` days using the pure
 * `detectAnomalies`. Each finding is stored once (`dedupeKey` =
 * metric:day) and pushed to staff with `reports.read` — in-app, push and
 * email via `StaffNotificationsService`.
 */
@Injectable()
export class AnomalyAlertsService {
  private readonly logger = new Logger(AnomalyAlertsService.name);
  private lastCheckedDay: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly staffNotifications: StaffNotificationsService,
  ) {}

  /** Recurring scheduler handler — cheap no-op after the first successful check each day. */
  async runSweep(now = new Date()): Promise<{ created: number }> {
    const today = dhakaDateKey(now);
    if (this.lastCheckedDay === today) return { created: 0 };
    if (!(await this.settings.getValue<boolean>("alerts.anomaly.enabled"))) return { created: 0 };
    const created = await this.detectForYesterday(now);
    this.lastCheckedDay = today;
    return { created };
  }

  async detectForYesterday(now: Date): Promise<number> {
    const [thresholdPercent, baselineDays, minBaselineOrders] = await Promise.all([
      this.settings.getValue<number>("alerts.anomaly.thresholdPercent"),
      this.settings.getValue<number>("alerts.anomaly.baselineDays"),
      this.settings.getValue<number>("alerts.anomaly.minBaselineOrders"),
    ]);
    const end = dhakaDayStart(now); // start of today = end of yesterday
    const yesterday = addDays(end, -1);
    const start = addDays(yesterday, -baselineDays);

    const [orders, shipments] = await Promise.all([
      this.prisma.order.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { createdAt: true, status: true, total: true } }),
      this.prisma.shipment.findMany({ where: { status: { in: FINAL_SHIPMENT }, updatedAt: { gte: start, lt: end } }, select: { status: true, updatedAt: true } }),
    ]);

    const buckets = new Map<string, DayBucket>();
    for (let d = start; d < end; d = addDays(d, 1)) buckets.set(dhakaDateKey(d), { orders: 0, revenue: 0, cancelled: 0, finalShipments: 0, rejectedShipments: 0 });
    for (const o of orders) {
      const b = buckets.get(dhakaDateKey(o.createdAt));
      if (!b) continue;
      b.orders += 1;
      if (CANCELLED_LIKE.includes(o.status)) b.cancelled += 1;
      else b.revenue += o.total;
    }
    for (const s of shipments) {
      const b = buckets.get(dhakaDateKey(s.updatedAt));
      if (!b) continue;
      b.finalShipments += 1;
      if (REJECTED_SHIPMENT.includes(s.status)) b.rejectedShipments += 1;
    }

    const dayKey = dhakaDateKey(yesterday);
    const observed = buckets.get(dayKey)!;
    const baseline = [...buckets.entries()].filter(([k]) => k !== dayKey).map(([, b]) => b);
    const rate = (n: number, d: number) => (d > 0 ? n / d : 0);
    const found = detectAnomalies(
      [
        { metric: "orders", kind: "count", observed: observed.orders, baseline: baseline.map((b) => b.orders) },
        { metric: "revenue", kind: "count", observed: observed.revenue, baseline: baseline.map((b) => b.revenue) },
        { metric: "cancellation_rate", kind: "rate", observed: rate(observed.cancelled, observed.orders), baseline: baseline.map((b) => rate(b.cancelled, b.orders)) },
        ...(observed.finalShipments >= 3
          ? [{ metric: "rejection_rate", kind: "rate" as const, observed: rate(observed.rejectedShipments, observed.finalShipments), baseline: baseline.filter((b) => b.finalShipments > 0).map((b) => rate(b.rejectedShipments, b.finalShipments)) }]
          : []),
      ],
      { thresholdPercent, minBaselineOrders, baselineAverageOrders: mean(baseline.map((b) => b.orders)) },
    );

    let created = 0;
    for (const anomaly of found) {
      const message = anomalyMessage(anomaly, dayKey);
      try {
        await this.prisma.anomalyAlert.create({
          data: { metric: anomaly.metric, severity: anomaly.severity, observed: anomaly.observed, expected: anomaly.expected, message, dedupeKey: `${anomaly.metric}:${dayKey}` },
        });
      } catch (error) {
        if (isUniqueViolation(error)) continue; // already alerted for this metric/day
        throw error;
      }
      created += 1;
      try {
        await this.staffNotifications.notifyStaffWithPermission({
          type: "anomaly",
          permission: "reports.read",
          link: "/alerts",
          title: { bn: anomaly.severity === "critical" ? "গুরুতর অস্বাভাবিকতা" : "অস্বাভাবিক পরিবর্তন", en: anomaly.severity === "critical" ? "Critical anomaly" : "Unusual change" },
          body: message,
        });
      } catch (error) {
        this.logger.warn(`Anomaly notification failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
    return created;
  }

  async list(includeAcknowledged: boolean) {
    return this.prisma.anomalyAlert.findMany({ where: includeAcknowledged ? {} : { acknowledgedAt: null }, orderBy: { createdAt: "desc" }, take: 100 });
  }

  async acknowledge(id: string, actor: AuthenticatedStaff) {
    const alert = await this.prisma.anomalyAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException({ code: "ALERT_NOT_FOUND", message: "Alert not found" });
    const updated = await this.prisma.anomalyAlert.update({ where: { id }, data: { acknowledgedAt: new Date(), acknowledgedBy: actor.id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "anomaly_alert.acknowledge", entityType: "anomaly_alert", entityId: id });
    return updated;
  }

  /** Manual "check now" from the Alerts screen (re-runs yesterday's check; dedupe keeps it idempotent). */
  async checkNow(actor: AuthenticatedStaff) {
    const created = await this.detectForYesterday(new Date());
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "anomaly_alert.check", entityType: "anomaly_alert", entityId: "sweep", after: { created } });
    return { created };
  }
}
