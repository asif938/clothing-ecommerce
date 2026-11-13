import { describe, expect, it, vi } from "vitest";
import { ReportBuilderService } from "./report-builder.service";
import { CohortsService } from "./cohorts.service";

const actor = { id: "staff-1", name: "A", email: "a@x", locale: "en", permissions: new Set<string>(), isSuperAdmin: false, totpEnabled: true };
const SETTINGS: Record<string, number> = { "reports.builder.maxRangeDays": 366, "reports.builder.maxSourceRows": 3 };

const order = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  createdAt: new Date("2026-11-05T10:00:00+06:00"),
  status: "confirmed",
  channel: "web",
  paymentStatus: "unpaid",
  subtotal: 100_000,
  discountTotal: 10_000,
  shippingFee: 6_000,
  total: 96_000,
  utmSource: null,
  customerId: "c1",
  items: [{ quantity: 2 }],
  ...over,
});

function make(orders: unknown[] = [], items: unknown[] = []) {
  const prisma = {
    order: { findMany: vi.fn(() => Promise.resolve(orders)), groupBy: vi.fn(() => Promise.resolve([{ customerId: "c1", _min: { createdAt: new Date("2026-10-01T00:00:00Z") } }])) },
    orderItem: { findMany: vi.fn(() => Promise.resolve(items)) },
    productOptionValue: { findMany: vi.fn(() => Promise.resolve([{ id: "ov-m", value: { en: "M" }, option: { type: "size" } }, { id: "ov-red", value: { en: "Red" }, option: { type: "color" } }])) },
    customReport: {
      create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: "r1", ...args.data })),
      findUnique: vi.fn(() => Promise.resolve({ id: "r1", name: "Sales", config: { dataset: "sales", dimensions: ["channel"], metrics: ["orders"] } })),
      update: vi.fn(() => Promise.resolve({})),
      delete: vi.fn(() => Promise.resolve({})),
    },
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const settings = { getValue: vi.fn((key: string) => Promise.resolve(SETTINGS[key])) };
  return { service: new ReportBuilderService(prisma as never, audit as never, settings as never), prisma, audit };
}

const from = new Date("2026-11-01T00:00:00+06:00");
const to = new Date("2026-11-30T23:59:59+06:00");
const salesConfig = (over: Record<string, unknown> = {}) => ({ dataset: "sales", dimensions: ["channel"], metrics: ["orders", "revenue"], ...over });

describe("ReportBuilderService.run", () => {
  it("aggregates orders from the database", async () => {
    const { service, prisma } = make([order("o1"), order("o2", { channel: "phone", total: 50_000 })]);
    const result = await service.run(service.parseConfig(salesConfig()), from, to);
    expect(result.rows).toEqual([
      { channel: "phone", orders: 1, revenue: 50_000 },
      { channel: "web", orders: 1, revenue: 96_000 },
    ]);
    // Unpaid/cancelled/expired orders are excluded unless asked for.
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { notIn: ["cancelled", "expired", "pending_payment"] } }) }));
  });

  it("includes unsold orders on request", async () => {
    const { service, prisma } = make([order("o1")]);
    await service.run(service.parseConfig(salesConfig({ includeUnsold: true })), from, to);
    const where = (prisma.order.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).not.toHaveProperty("status");
  });

  it("splits new from returning customers using each customer's first order", async () => {
    const first = order("o1", { customerId: "c1", createdAt: new Date("2026-11-05T10:00:00+06:00") });
    const guest = order("o2", { customerId: null });
    const { service, prisma } = make([first, guest]);
    prisma.order.groupBy.mockResolvedValueOnce([{ customerId: "c1", _min: { createdAt: first.createdAt } }] as never);
    const result = await service.run(service.parseConfig(salesConfig({ dimensions: ["customerType"], metrics: ["orders"] })), from, to);
    expect(result.rows).toEqual([
      { customerType: "guest", orders: 1 },
      { customerType: "new", orders: 1 },
    ]);
    const second = make([order("o3", { customerId: "c1" })]);
    const again = await second.service.run(second.service.parseConfig(salesConfig({ dimensions: ["customerType"], metrics: ["orders"] })), from, to);
    expect(again.rows).toEqual([{ customerType: "returning", orders: 1 }]);
  });

  it("refuses ranges over the configured maximum and inverted ranges", async () => {
    const { service } = make();
    const config = service.parseConfig(salesConfig());
    await expect(service.run(config, new Date("2024-01-01"), new Date("2026-01-01"))).rejects.toMatchObject({ response: { code: "RANGE_TOO_LONG" } });
    await expect(service.run(config, to, from)).rejects.toMatchObject({ response: { code: "INVALID_RANGE" } });
  });

  it("refuses to aggregate more source rows than the cap", async () => {
    const { service } = make([order("1"), order("2"), order("3"), order("4")]);
    await expect(service.run(service.parseConfig(salesConfig()), from, to)).rejects.toMatchObject({ response: { code: "REPORT_TOO_LARGE" } });
  });

  it("builds the products dataset with size, colour, category and COGS", async () => {
    const item = {
      orderId: "o1",
      sku: "SH-M-RED",
      quantity: 2,
      lineTotal: 200_000,
      costPrice: 60_000,
      optionsSnapshot: { optionValueIds: ["ov-m", "ov-red"] },
      order: { createdAt: new Date("2026-11-05T10:00:00+06:00"), channel: "web" },
      variant: { product: { title: { en: "Oxford Shirt" }, category: { name: { en: "Shirts" } } } },
    };
    const { service } = make([], [item]);
    const result = await service.run(service.parseConfig({ dataset: "products", dimensions: ["category", "size"], metrics: ["units", "revenue", "grossProfit"] }), from, to);
    expect(result.rows).toEqual([{ category: "Shirts", size: "M", units: 2, revenue: 200_000, grossProfit: 80_000 }]);
  });
});

describe("ReportBuilderService saved reports", () => {
  it("rejects a config that does not fit its dataset", async () => {
    const { service, prisma } = make();
    await expect(service.create({ name: "Bad", config: { dataset: "sales", dimensions: ["product"], metrics: ["orders"] } }, actor)).rejects.toMatchObject({ response: { code: "REPORT_CONFIG_INVALID" } });
    await expect(service.create({ name: "Bad", config: { dataset: "nope", dimensions: [], metrics: ["orders"] } }, actor)).rejects.toMatchObject({ response: { code: "REPORT_CONFIG_INVALID" } });
    expect(prisma.customReport.create).not.toHaveBeenCalled();
  });

  it("saves a valid config with defaults filled in, and audits it", async () => {
    const { service, prisma, audit } = make();
    await service.create({ name: "Weekly", config: salesConfig() }, actor);
    expect(prisma.customReport.create).toHaveBeenCalledWith({ data: expect.objectContaining({ createdBy: "staff-1", config: expect.objectContaining({ filters: [], limit: 500, includeUnsold: false, sort: null }) }) });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "custom_report.create" }));
  });

  it("404s on a missing report", async () => {
    const { service, prisma } = make();
    prisma.customReport.findUnique.mockResolvedValueOnce(null as never);
    await expect(service.get("nope")).rejects.toMatchObject({ response: { code: "REPORT_NOT_FOUND" } });
  });
});

describe("CohortsService", () => {
  it("turns the SQL aggregates into a retention matrix and an LTV summary", async () => {
    const month = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 7);
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ cohort: month, month, customers: 4, orders: 4, revenue: BigInt(400_000) }])
        .mockResolvedValueOnce([
          { orders: 1, revenue: BigInt(100_000) },
          { orders: 3, revenue: BigInt(300_000) },
        ]),
    };
    const report = await new CohortsService(prisma as never).report(6);
    expect(report.cohorts).toHaveLength(1);
    expect(report.cohorts[0]).toMatchObject({ cohort: month, size: 4, totalRevenue: 400_000 });
    expect(report.cohorts[0]!.retention[0]).toBe(1);
    expect(report.cohorts[0]!.retention[1]).toBeNull();
    expect(report.summary).toMatchObject({ customers: 2, averageLtv: 200_000, repeatRate: 0.5 });
  });
});
