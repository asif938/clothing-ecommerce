import { describe, expect, it, vi } from "vitest";
import { PurchaseOrdersService } from "./purchase-orders.service";

const actor = { id: "staff-1", name: "A", email: "a@x", locale: "en", permissions: new Set<string>(), isSuperAdmin: false, totpEnabled: true };

function makeService(po: Record<string, unknown> | null, opts: { costPrice?: number | null; onHand?: number; costMethod?: string } = {}) {
  const tx = {
    purchaseOrder: { findUnique: vi.fn(() => Promise.resolve(po)), update: vi.fn(() => Promise.resolve({})) },
    productVariant: { findUniqueOrThrow: vi.fn(() => Promise.resolve({ costPrice: opts.costPrice === undefined ? 50_000 : opts.costPrice })), update: vi.fn(() => Promise.resolve({})) },
    inventoryLevel: { aggregate: vi.fn(() => Promise.resolve({ _sum: { onHand: opts.onHand ?? 10 } })) },
    purchaseOrderItem: { update: vi.fn(() => Promise.resolve({})) },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    purchaseOrder: {
      findUnique: vi.fn(() => Promise.resolve({ id: "po1", items: [] })),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
    },
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const settings = { getValue: vi.fn(() => Promise.resolve(opts.costMethod ?? "weighted_average")) };
  const inventory = {
    applyMovementTx: vi.fn((_tx: unknown, input: { variantId: string }) => Promise.resolve({ variantId: input.variantId, onHandBefore: 0, onHandAfter: 1, becameAvailable: false })),
    afterMovementsCommitted: vi.fn(() => Promise.resolve()),
  };
  const service = new PurchaseOrdersService(prisma as never, audit as never, settings as never, inventory as never);
  return { service, tx, prisma, inventory, audit };
}

const sentPo = {
  id: "po1",
  number: "PO-261112-0001",
  status: "sent",
  locationId: "loc1",
  items: [
    { id: "i1", variantId: "v1", qtyOrdered: 30, qtyReceived: 0, unitCost: 60_000 },
    { id: "i2", variantId: "v2", qtyOrdered: 5, qtyReceived: 0, unitCost: 10_000 },
  ],
};

describe("PurchaseOrdersService.receive", () => {
  it("books stock, blends the cost price and marks the order partially received", async () => {
    const { service, tx, inventory } = makeService(structuredClone(sentPo));
    await service.receive("po1", { lines: [{ variantId: "v1", quantity: 30 }], allowOverReceipt: false }, actor);

    expect(inventory.applyMovementTx).toHaveBeenCalledWith(tx, expect.objectContaining({ variantId: "v1", locationId: "loc1", quantity: 30, reason: "purchase_receive", referenceType: "purchase_order", referenceId: "po1" }));
    // 10 on hand @ ৳500 + 30 @ ৳600 → ৳575
    expect(tx.productVariant.update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { costPrice: 57_500 } });
    expect(tx.purchaseOrderItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { qtyReceived: { increment: 30 } } });
    expect(tx.purchaseOrder.update).toHaveBeenCalledWith({ where: { id: "po1" }, data: { status: "partially_received" } });
    expect(inventory.afterMovementsCommitted).toHaveBeenCalled();
  });

  it("marks the order received once every line is in", async () => {
    const { service, tx } = makeService(structuredClone(sentPo));
    await service.receive("po1", { lines: [{ variantId: "v1", quantity: 30 }, { variantId: "v2", quantity: 5 }], allowOverReceipt: false }, actor);
    expect(tx.purchaseOrder.update).toHaveBeenCalledWith({ where: { id: "po1" }, data: expect.objectContaining({ status: "received", receivedAt: expect.any(Date) }) });
  });

  it("leaves the cost alone when the method is 'none'", async () => {
    const { service, tx } = makeService(structuredClone(sentPo), { costMethod: "none" });
    await service.receive("po1", { lines: [{ variantId: "v1", quantity: 1 }], allowOverReceipt: false }, actor);
    expect(tx.productVariant.update).not.toHaveBeenCalled();
  });

  it("refuses an over-receipt unless explicitly allowed", async () => {
    const { service } = makeService(structuredClone(sentPo));
    await expect(service.receive("po1", { lines: [{ variantId: "v2", quantity: 6 }], allowOverReceipt: false }, actor)).rejects.toMatchObject({ response: { code: "OVER_RECEIPT" } });
    const ok = makeService(structuredClone(sentPo));
    await ok.service.receive("po1", { lines: [{ variantId: "v2", quantity: 6 }], allowOverReceipt: true }, actor);
    expect(ok.tx.purchaseOrder.update).toHaveBeenCalledWith({ where: { id: "po1" }, data: expect.objectContaining({ status: "partially_received" }) });
  });

  it("refuses to receive a draft or a variant not on the order", async () => {
    const { service } = makeService({ ...structuredClone(sentPo), status: "draft" });
    await expect(service.receive("po1", { lines: [{ variantId: "v1", quantity: 1 }], allowOverReceipt: false }, actor)).rejects.toMatchObject({ response: { code: "PURCHASE_ORDER_NOT_RECEIVABLE" } });
    const other = makeService(structuredClone(sentPo));
    await expect(other.service.receive("po1", { lines: [{ variantId: "v9", quantity: 1 }], allowOverReceipt: false }, actor)).rejects.toMatchObject({ response: { code: "NOT_ON_PURCHASE_ORDER" } });
  });
});

describe("PurchaseOrdersService.send/cancel", () => {
  it("only sends drafts", async () => {
    const { service, prisma } = makeService(null);
    prisma.purchaseOrder.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.send("po1", actor)).rejects.toMatchObject({ response: { code: "PURCHASE_ORDER_NOT_DRAFT" } });
  });
  it("cancels open orders and audits it", async () => {
    const { service, prisma, audit } = makeService(null);
    await service.cancel("po1", actor);
    expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith({ where: { id: "po1", status: { in: ["draft", "sent", "partially_received"] } }, data: expect.objectContaining({ status: "cancelled" }) });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "purchase_order.cancel" }));
  });
});
