import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ReportFrequency, ScheduledReport } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { NotificationDriversService } from "../notifications/notification-drivers.service";
import { ProfitService } from "../finance/profit.service";
import { CodSettlementsService } from "../finance/cod-settlements.service";
import { dhakaDateKey, addDays } from "../common/dhaka-time";
import type { AuthenticatedStaff } from "../common/types";
import { ReportsService } from "./reports.service";
import { nextRunAt, reportPeriod } from "./schedule";
import { SCHEDULABLE_REPORTS, renderReportHtml, type RenderedReport, type SchedulableReportKey } from "./report-catalog";
import type { ScheduledReportDto, UpdateScheduledReportDto } from "./scheduled-reports.dto";

const H = (bn: string, en: string) => ({ bn, en });

/**
 * Scheduled email reports (docs/PROJECT_SPEC.md §8.2 Reports "Scheduled
 * email reports (phase 2)", §16 M12). A recurring scheduler handler sends
 * every due schedule as an HTML table through the configured email provider
 * (golden rule 2 — mock driver when none is set up). Each run is *claimed*
 * by advancing `nextRunAt` with a compare-and-set before sending, so two
 * workers (embedded tick + external cron) can never send the same report
 * twice.
 */
@Injectable()
export class ScheduledReportsService {
  private readonly logger = new Logger(ScheduledReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly drivers: NotificationDriversService,
    private readonly reports: ReportsService,
    private readonly profit: ProfitService,
    private readonly cod: CodSettlementsService,
  ) {}

  private assertCanSchedule(reportKey: SchedulableReportKey, actor: AuthenticatedStaff) {
    const needed = SCHEDULABLE_REPORTS[reportKey].permission;
    if (!actor.permissions.has(needed)) throw new ForbiddenException({ code: "FORBIDDEN", message: "You can't schedule a report you aren't allowed to view", missing: [needed] });
  }

  private async computeNextRun(frequency: ReportFrequency, after: Date): Promise<Date> {
    return nextRunAt(frequency, after, await this.settings.getValue<number>("reports.scheduled.sendHour"));
  }

  async list() {
    return this.prisma.scheduledReport.findMany({ orderBy: { createdAt: "desc" } });
  }

  async create(dto: ScheduledReportDto, actor: AuthenticatedStaff) {
    this.assertCanSchedule(dto.reportKey, actor);
    const row = await this.prisma.scheduledReport.create({
      data: { ...dto, nextRunAt: await this.computeNextRun(dto.frequency, new Date()), createdBy: actor.id },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "scheduled_report.create", entityType: "scheduled_report", entityId: row.id, after: row });
    return row;
  }

  async update(id: string, dto: UpdateScheduledReportDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.scheduledReport.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: "SCHEDULED_REPORT_NOT_FOUND", message: "Scheduled report not found" });
    this.assertCanSchedule((dto.reportKey ?? before.reportKey) as SchedulableReportKey, actor);
    const frequencyChanged = dto.frequency !== undefined && dto.frequency !== before.frequency;
    const reactivated = dto.isActive === true && !before.isActive;
    const row = await this.prisma.scheduledReport.update({
      where: { id },
      data: { ...dto, ...(frequencyChanged || reactivated ? { nextRunAt: await this.computeNextRun(dto.frequency ?? before.frequency, new Date()) } : {}) },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "scheduled_report.update", entityType: "scheduled_report", entityId: id, before, after: row });
    return row;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.prisma.scheduledReport.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: "SCHEDULED_REPORT_NOT_FOUND", message: "Scheduled report not found" });
    await this.prisma.scheduledReport.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "scheduled_report.delete", entityType: "scheduled_report", entityId: id, before });
  }

  /** "Send now" — sends the period the next scheduled run would cover, without moving the schedule. */
  async sendNow(id: string, actor: AuthenticatedStaff) {
    const row = await this.prisma.scheduledReport.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: "SCHEDULED_REPORT_NOT_FOUND", message: "Scheduled report not found" });
    this.assertCanSchedule(row.reportKey as SchedulableReportKey, actor);
    await this.send(row, new Date());
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "scheduled_report.send_now", entityType: "scheduled_report", entityId: id, after: { recipients: row.recipients } });
    return { sent: row.recipients.length };
  }

  /** Recurring scheduler handler. */
  async runDue(now = new Date()): Promise<{ sent: number }> {
    if (!(await this.settings.getValue<boolean>("reports.scheduled.enabled"))) return { sent: 0 };
    const due = await this.prisma.scheduledReport.findMany({ where: { isActive: true, nextRunAt: { lte: now } }, take: 20 });
    let sent = 0;
    for (const row of due) {
      const next = await this.computeNextRun(row.frequency, now);
      // Compare-and-set claim on the exact `nextRunAt` we read.
      const { count } = await this.prisma.scheduledReport.updateMany({ where: { id: row.id, nextRunAt: row.nextRunAt }, data: { nextRunAt: next } });
      if (count === 0) continue;
      try {
        await this.send(row, row.nextRunAt);
        await this.prisma.scheduledReport.update({ where: { id: row.id }, data: { lastSentAt: new Date(), lastError: null } });
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        this.logger.error(`Scheduled report ${row.id} failed: ${message}`);
        await this.prisma.scheduledReport.update({ where: { id: row.id }, data: { lastError: message.slice(0, 500) } });
      }
    }
    return { sent };
  }

  private async send(row: ScheduledReport, runAt: Date): Promise<void> {
    const locale: "bn" | "en" = row.locale === "en" ? "en" : "bn";
    const key = row.reportKey as SchedulableReportKey;
    if (!(key in SCHEDULABLE_REPORTS)) throw new BadRequestException({ code: "UNKNOWN_REPORT", message: `Unknown report "${row.reportKey}"` });
    const { from, to } = reportPeriod(row.frequency, runAt);
    const report = await this.build(key, from, to);
    const title = `${row.name} — ${SCHEDULABLE_REPORTS[key].title[locale]}`;
    const periodLabel = key === "cod_outstanding" ? dhakaDateKey(runAt) : `${dhakaDateKey(from)} → ${dhakaDateKey(addDays(to, -1))}`;
    const html = renderReportHtml(title, periodLabel, report, locale, locale === "bn" ? "এই সময়ে কোনো ডেটা নেই।" : "No data for this period.");
    const { driver } = await this.drivers.resolveEmail();
    for (const to of row.recipients) await driver.send({ to, subject: `${title} (${periodLabel})`, html });
  }

  private async build(key: SchedulableReportKey, from: Date, to: Date): Promise<RenderedReport> {
    switch (key) {
      case "sales":
        return {
          columns: [{ key: "day", header: H("দিন", "Day") }, { key: "orders", header: H("অর্ডার", "Orders") }, { key: "revenue", header: H("আয়", "Revenue"), money: true }, { key: "cancelled", header: H("বাতিল", "Cancelled") }],
          rows: await this.reports.salesByDay(from, to),
        };
      case "products":
        return {
          columns: [{ key: "sku", header: H("SKU", "SKU") }, { key: "productSlug", header: H("পণ্য", "Product") }, { key: "quantity", header: H("বিক্রি", "Sold") }, { key: "revenue", header: H("আয়", "Revenue"), money: true }],
          rows: await this.reports.topProducts(from, to, 30),
        };
      case "courier":
        return {
          columns: [
            { key: "driver", header: H("কুরিয়ার", "Courier") },
            { key: "booked", header: H("বুকড", "Booked") },
            { key: "delivered", header: H("ডেলিভারড", "Delivered") },
            { key: "rejected", header: H("রিজেক্টেড", "Rejected") },
            { key: "successRate", header: H("সফলতা", "Success"), percent: true },
          ],
          rows: await this.reports.courierPerformance(from, to),
        };
      case "staff":
        return {
          columns: [{ key: "name", header: H("স্টাফ", "Staff") }, { key: "confirmations", header: H("কনফার্ম", "Confirmations") }, { key: "avgMinutesToConfirm", header: H("গড় মিনিট", "Avg minutes") }],
          rows: await this.reports.staffPerformance(from, to),
        };
      case "discounts":
        return {
          columns: [{ key: "name", header: H("ডিসকাউন্ট", "Discount") }, { key: "code", header: H("কোড", "Code") }, { key: "uses", header: H("ব্যবহার", "Uses") }, { key: "totalDiscounted", header: H("মোট ছাড়", "Discounted"), money: true }],
          rows: await this.reports.discountUsage(from, to),
        };
      case "search_terms":
        return {
          columns: [{ key: "term", header: H("টার্ম", "Term") }, { key: "searches", header: H("সার্চ", "Searches") }, { key: "zeroResultSearches", header: H("ফলাফল নেই", "Zero results") }],
          rows: (await this.reports.searchTerms(from, to)).slice(0, 50),
        };
      case "profit": {
        const report = await this.profit.report(from, to);
        const s = report.summary;
        return {
          columns: [{ key: "label", header: H("", "") }, { key: "value", header: H("পরিমাণ", "Amount"), money: true }],
          rows: [
            { label: "Revenue / আয়", value: s.revenue },
            { label: "COGS / পণ্যের খরচ", value: s.cogs },
            { label: "Courier / কুরিয়ার", value: s.courierCost },
            { label: "Gateway fees / গেটওয়ে ফি", value: s.gatewayFees },
            { label: "Profit / মুনাফা", value: s.profit },
          ],
        };
      }
      case "cod_outstanding":
        return {
          columns: [{ key: "courierDriver", header: H("কুরিয়ার", "Courier") }, { key: "shipments", header: H("পার্সেল", "Parcels") }, { key: "amount", header: H("বকেয়া", "Outstanding"), money: true }, { key: "oldestDeliveredAt", header: H("সবচেয়ে পুরনো", "Oldest") }],
          rows: await this.cod.outstanding(),
        };
    }
  }
}
