import { describe, expect, it, vi } from "vitest";
import { ReorderService } from "./reorder.service";

const actor = { id: "staff-1", name: "A", email: "a@x", locale: "en", permissions: new Set<string>(), isSuperAdmin: false, totpEnabled: true };
const SETTINGS: Record<string, number> = { "forecast.lookbackDays": 30, "forecast.horizonDays": 30, "procurement.leadTimeDays": 14, "procurement.safetyStockDays": 7, "procurement.coverDays": 30 };

function todayKey(offset = 0): string {
  return new Date(Date.now() + 6 * 3600_000 - offset * 86_400_000).toISOString().slice(0, 10);
}

function makeService(opts: { sales?: { variant_id: string; day: string; units: number }[]; onHand?: Record<string, number>; supplier?: { id: string; name: string; leadTimeDays: number | null } } = {}) {
  const sales = opts.sales ?? [];
  const prisma = {
    $queryRaw: vi.fn(() => Promise.resolve(sales)),
    productVariant: {
      findMany: vi.fn((args: { where: { id: { in: string[] } } }) => Promise.resolve(args.where.id.in.map((id) => ({ id, sku: `SKU-${id}`, costPrice: 50_000, product: { id: `p-${id}`, title: { en: `Shirt ${id}` } } })))),
    },
    inventoryLevel: { groupBy: vi.fn(() => Promise.resolve(Object.entries(opts.onHand ?? {}).map(([variantId, onHand]) => ({ variantId, _sum: { onHand } })))) },
    purchaseOrderItem: {
      findMany: vi.fn((args: { where: { purchaseOrder: { status: unknown } } }) => {
        const isIncoming = typeof args.where.purchaseOrder.status === "object" && "in" in (args.where.purchaseOrder.status as object);
        if (isIncoming) return Promise.resolve([]);
        return Promise.resolve(opts.supplier ? sales.map((s) => ({ variantId: s.variant_id, purchaseOrder: { supplier: opts.supplier } })) : []);
      }),
    },
  };
  const settings = { getValue: vi.fn((key: string) => Promise.resolve(SETTINGS[key])) };
  const purchaseOrders = { create: vi.fn((dto: { supplierId: string; items: unknown[] }) => Promise.resolve({ id: `po-${dto.supplierId}`, number: `PO-${dto.supplierId}`, totalCost: 1 })) };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const service = new ReorderService(prisma as never, settings as never, purchaseOrders as never, audit as never);
  return { service, prisma, purchaseOrders, audit };
}

describe("ReorderService.suggestions", () => {
  it("returns nothing when nothing sold", async () => {
    const { service } = makeService();
    const result = await service.suggestions({ show: "actionable" });
    expect(result.rows).toEqual([]);
    expect(result.totals.variants).toBe(0);
  });

  it("flags a fast seller that is nearly out of stock as critical and sizes the order", async () => {
    // 2 units/day for the last 30 days, 4 on hand.
    const sales = Array.from({ length: 30 }, (_, i) => ({ variant_id: "v1", day: todayKey(i), units: 2 }));
    const { service } = makeService({ sales, onHand: { v1: 4 }, supplier: { id: "s1", name: "Fabric Co", leadTimeDays: 10 } });
    const result = await service.suggestions({ show: "actionable" });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0]!;
    expect(row).toMatchObject({ variantId: "v1", supplierId: "s1", leadTimeDays: 10, onHand: 4, urgency: "critical" });
    expect(row.dailyRate).toBeCloseTo(2, 1);
    // target = rate*(10+30) + rate*7 = 94; position 4 → ~90.
    expect(row.suggestedQty).toBeGreaterThan(85);
    expect(row.estimatedCost).toBe(row.suggestedQty * 50_000);
    expect(result.totals).toMatchObject({ actionable: 1, critical: 1 });
  });

  it("uses the default lead time when the variant has no supplier, and hides well-stocked variants unless asked", async () => {
    const sales = Array.from({ length: 30 }, (_, i) => ({ variant_id: "v1", day: todayKey(i), units: 1 }));
    const { service } = makeService({ sales, onHand: { v1: 500 } });
    expect((await service.suggestions({ show: "actionable" })).rows).toHaveLength(0);
    const all = await service.suggestions({ show: "all" });
    expect(all.rows).toHaveLength(1);
    expect(all.rows[0]).toMatchObject({ leadTimeDays: 14, urgency: "ok", supplierId: null });
  });
});

describe("ReorderService.createDraftOrders", () => {
  it("creates one draft per supplier at the variant's cost price", async () => {
    const { service, purchaseOrders, audit } = makeService();
    const result = await service.createDraftOrders(
      {
        locationId: "loc1",
        items: [
          { variantId: "a", supplierId: "s1", quantity: 10 },
          { variantId: "b", supplierId: "s2", quantity: 5 },
          { variantId: "c", supplierId: "s1", quantity: 7 },
        ],
      },
      actor,
    );
    expect(result.created).toHaveLength(2);
    expect(purchaseOrders.create).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId: "s1", type: "purchase", locationId: "loc1", items: [{ variantId: "a", qtyOrdered: 10, unitCost: 50_000 }, { variantId: "c", qtyOrdered: 7, unitCost: 50_000 }] }),
      actor,
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "reorder.create_drafts" }));
  });

  it("rejects unknown variants", async () => {
    const { service, prisma } = makeService();
    prisma.productVariant.findMany.mockResolvedValueOnce([]);
    await expect(service.createDraftOrders({ locationId: "loc1", items: [{ variantId: "gone", supplierId: "s1", quantity: 1 }] }, actor)).rejects.toMatchObject({ response: { code: "VARIANT_NOT_FOUND" } });
  });
});
