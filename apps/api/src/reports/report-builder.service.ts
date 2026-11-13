import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@clothing/db";
import { reportConfigSchema, validateReportConfig, type ReportConfig } from "@clothing/shared/analytics";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { dhakaDateKey } from "../common/dhaka-time";
import type { AuthenticatedStaff } from "../common/types";
import { aggregate, weekStartKey, type ReportResult, type SourceRow } from "./report-builder";

const NOT_SOLD = ["cancelled", "expired", "pending_payment"] as const;
const DAY_MS = 86_400_000;

type Localized = { bn?: string; en?: string } | null;
const label = (value: unknown): string => {
  const v = value as Localized;
  return (v?.en || v?.bn || "").trim() || "(none)";
};

export interface SavedReportInput {
  name: string;
  description?: string | null;
  config: unknown;
}

/**
 * Report builder (docs/PROJECT_SPEC.md §8.2 Reports "report builder", §16
 * M17): staff pick a dataset, dimensions, metrics and filters, run it over a
 * date range, export CSV, and save the definition. Computed live from
 * orders, so the range and row count are capped by settings to keep a
 * free-tier database responsive.
 */
@Injectable()
export class ReportBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  // ---------------------------------------------------------------- saved reports

  list() {
    return this.prisma.customReport.findMany({ orderBy: { updatedAt: "desc" }, take: 200 });
  }

  async get(id: string) {
    const report = await this.prisma.customReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException({ code: "REPORT_NOT_FOUND", message: "Report not found" });
    return report;
  }

  /** Parses and semantically validates a config, throwing a 400 that names the problem. */
  parseConfig(raw: unknown): ReportConfig {
    const parsed = reportConfigSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException({ code: "REPORT_CONFIG_INVALID", message: parsed.error.issues[0]?.message ?? "Invalid report", details: parsed.error.issues });
    const problem = validateReportConfig(parsed.data);
    if (problem) throw new BadRequestException({ code: "REPORT_CONFIG_INVALID", message: problem });
    return parsed.data;
  }

  async create(input: SavedReportInput, actor: AuthenticatedStaff) {
    const config = this.parseConfig(input.config);
    const report = await this.prisma.customReport.create({ data: { name: input.name, description: input.description ?? null, config: config as unknown as Prisma.InputJsonValue, createdBy: actor.id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "custom_report.create", entityType: "custom_report", entityId: report.id, after: { name: input.name, dataset: config.dataset } });
    return report;
  }

  async update(id: string, input: Partial<SavedReportInput>, actor: AuthenticatedStaff) {
    await this.get(id);
    const config = input.config === undefined ? undefined : this.parseConfig(input.config);
    const report = await this.prisma.customReport.update({
      where: { id },
      data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.description !== undefined ? { description: input.description } : {}), ...(config ? { config: config as unknown as Prisma.InputJsonValue } : {}) },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "custom_report.update", entityType: "custom_report", entityId: id, after: { name: input.name, dataset: config?.dataset } });
    return report;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const report = await this.get(id);
    await this.prisma.customReport.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "custom_report.delete", entityType: "custom_report", entityId: id, before: { name: report.name } });
  }

  // ---------------------------------------------------------------- running

  async runSaved(id: string, from: Date, to: Date) {
    const report = await this.get(id);
    return this.run(this.parseConfig(report.config), from, to);
  }

  async run(config: ReportConfig, from: Date, to: Date): Promise<ReportResult & { range: { from: Date; to: Date } }> {
    const [maxRangeDays, maxRows] = await Promise.all([this.settings.getValue<number>("reports.builder.maxRangeDays"), this.settings.getValue<number>("reports.builder.maxSourceRows")]);
    if (to < from) throw new BadRequestException({ code: "INVALID_RANGE", message: "The end date is before the start date" });
    if ((to.getTime() - from.getTime()) / DAY_MS > maxRangeDays) throw new BadRequestException({ code: "RANGE_TOO_LONG", message: `Reports cover at most ${maxRangeDays} days at a time` });

    const rows = config.dataset === "sales" ? await this.loadSales(config, from, to, maxRows) : await this.loadProducts(config, from, to, maxRows);
    return { ...aggregate(rows, config), range: { from, to } };
  }

  private tooLarge(maxRows: number): never {
    throw new BadRequestException({ code: "REPORT_TOO_LARGE", message: `That range has more than ${maxRows} rows — pick a shorter range or add a filter`, details: { maxRows } });
  }

  private usesDimension(config: ReportConfig, key: string): boolean {
    return config.dimensions.includes(key) || config.filters.some((f) => f.field === key);
  }

  private async loadSales(config: ReportConfig, from: Date, to: Date, maxRows: number): Promise<SourceRow[]> {
    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: from, lte: to }, ...(config.includeUnsold ? {} : { status: { notIn: [...NOT_SOLD] } }) },
      select: {
        id: true,
        createdAt: true,
        status: true,
        channel: true,
        paymentStatus: true,
        subtotal: true,
        discountTotal: true,
        shippingFee: true,
        total: true,
        utmSource: true,
        customerId: true,
        items: { select: { quantity: true } },
      },
      orderBy: { createdAt: "asc" },
      take: maxRows + 1,
    });
    if (orders.length > maxRows) this.tooLarge(maxRows);

    // "New" = this is the customer's first order that wasn't cancelled/expired/unpaid.
    const firstOrderAt = new Map<string, Date>();
    if (this.usesDimension(config, "customerType")) {
      const ids = [...new Set(orders.map((o) => o.customerId).filter((id): id is string => id !== null))];
      const firsts = ids.length === 0 ? [] : await this.prisma.order.groupBy({ by: ["customerId"], where: { customerId: { in: ids }, status: { notIn: [...NOT_SOLD] } }, _min: { createdAt: true } });
      for (const f of firsts) if (f.customerId && f._min.createdAt) firstOrderAt.set(f.customerId, f._min.createdAt);
    }

    return orders.map((o) => {
      const first = o.customerId ? firstOrderAt.get(o.customerId) : undefined;
      return {
        orderId: o.id,
        dims: {
          day: dhakaDateKey(o.createdAt),
          week: weekStartKey(o.createdAt),
          month: dhakaDateKey(o.createdAt).slice(0, 7),
          status: o.status,
          channel: o.channel,
          source: o.utmSource?.trim() || "direct",
          paymentStatus: o.paymentStatus,
          customerType: !o.customerId ? "guest" : first && first.getTime() < o.createdAt.getTime() ? "returning" : "new",
        },
        units: o.items.reduce((a, i) => a + i.quantity, 0),
        subtotal: o.subtotal,
        discount: o.discountTotal,
        shipping: o.shippingFee,
        revenue: o.total,
        cogs: 0,
      };
    });
  }

  private async loadProducts(config: ReportConfig, from: Date, to: Date, maxRows: number): Promise<SourceRow[]> {
    const items = await this.prisma.orderItem.findMany({
      where: { order: { createdAt: { gte: from, lte: to }, ...(config.includeUnsold ? {} : { status: { notIn: [...NOT_SOLD] } }) } },
      select: {
        orderId: true,
        sku: true,
        quantity: true,
        lineTotal: true,
        costPrice: true,
        optionsSnapshot: true,
        order: { select: { createdAt: true, channel: true } },
        variant: { select: { product: { select: { title: true, category: { select: { name: true } } } } } },
      },
      orderBy: { order: { createdAt: "asc" } },
      take: maxRows + 1,
    });
    if (items.length > maxRows) this.tooLarge(maxRows);

    // Size / colour labels come from the option values the line was bought with.
    const optionLabel = new Map<string, { type: string; label: string }>();
    if (this.usesDimension(config, "size") || this.usesDimension(config, "color")) {
      const ids = [...new Set(items.flatMap((i) => ((i.optionsSnapshot as { optionValueIds?: string[] } | null)?.optionValueIds ?? []).filter(Boolean)))];
      const values = ids.length === 0 ? [] : await this.prisma.productOptionValue.findMany({ where: { id: { in: ids } }, select: { id: true, value: true, option: { select: { type: true } } } });
      for (const v of values) optionLabel.set(v.id, { type: v.option.type, label: label(v.value) });
    }

    return items.map((i) => {
      const ids = (i.optionsSnapshot as { optionValueIds?: string[] } | null)?.optionValueIds ?? [];
      const pick = (type: string) => ids.map((id) => optionLabel.get(id)).find((o) => o?.type === type)?.label;
      const dims: Record<string, string> = {
        day: dhakaDateKey(i.order.createdAt),
        month: dhakaDateKey(i.order.createdAt).slice(0, 7),
        product: label(i.variant.product.title),
        category: i.variant.product.category ? label(i.variant.product.category.name) : "(none)",
        sku: i.sku,
        channel: i.order.channel,
      };
      const size = pick("size");
      const color = pick("color");
      if (size) dims.size = size;
      if (color) dims.color = color;
      return { orderId: i.orderId, dims, units: i.quantity, subtotal: i.lineTotal, discount: 0, shipping: 0, revenue: i.lineTotal, cogs: (i.costPrice ?? 0) * i.quantity };
    });
  }
}
