import { describe, expect, it, vi } from "vitest";
import { OrderExpiryService } from "./order-expiry.service";

function makePrisma(orders: { id: string; orderNumber: string; items: { variantId: string; locationId: string; quantity: number }[] }[], claimCount = 1) {
  const orderUpdate = vi.fn();
  const eventCreate = vi.fn();
  const orderUpdateMany = vi.fn(() => Promise.resolve({ count: claimCount }));
  const tx = {
    order: { update: orderUpdate, updateMany: orderUpdateMany },
    orderEvent: { create: eventCreate },
    $executeRaw: vi.fn(() => Promise.resolve(1)),
    discountUsage: { findMany: vi.fn(() => Promise.resolve([])), deleteMany: vi.fn() },
    discount: { updateMany: vi.fn() },
    discountCode: { updateMany: vi.fn() },
  };
  return {
    order: { findMany: vi.fn(() => Promise.resolve(orders)) },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    _tx: tx,
  };
}

describe("OrderExpiryService.runSweep", () => {
  it("releases stock and marks the order expired", async () => {
    const prisma = makePrisma([{ id: "o1", orderNumber: "DEM2601050001", items: [{ variantId: "v1", locationId: "loc-1", quantity: 2 }] }]);
    const release = vi.fn(() => Promise.resolve());
    const service = new OrderExpiryService(prisma as never, { release } as never, { restoreInTx: vi.fn().mockResolvedValue(0) } as never);

    const result = await service.runSweep();

    expect(result.expired).toBe(1);
    expect(release).toHaveBeenCalledWith(prisma._tx, "loc-1", [{ variantId: "v1", quantity: 2 }]);
    expect(prisma._tx.order.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "o1" }, data: expect.objectContaining({ status: "expired" }) }));
    expect(prisma._tx.orderEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ orderId: "o1", type: "status_change" }) }));
  });

  it("groups multiple lines by location before releasing", async () => {
    const prisma = makePrisma([
      { id: "o1", orderNumber: "DEM2601050001", items: [{ variantId: "v1", locationId: "loc-1", quantity: 1 }, { variantId: "v2", locationId: "loc-1", quantity: 3 }] },
    ]);
    const release = vi.fn(() => Promise.resolve());
    const service = new OrderExpiryService(prisma as never, { release } as never, { restoreInTx: vi.fn().mockResolvedValue(0) } as never);

    await service.runSweep();

    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(prisma._tx, "loc-1", [{ variantId: "v1", quantity: 1 }, { variantId: "v2", quantity: 3 }]);
  });

  it("does nothing when there are no expired orders", async () => {
    const prisma = makePrisma([]);
    const release = vi.fn();
    const service = new OrderExpiryService(prisma as never, { release } as never, { restoreInTx: vi.fn().mockResolvedValue(0) } as never);

    const result = await service.runSweep();

    expect(result.expired).toBe(0);
    expect(release).not.toHaveBeenCalled();
  });
});

describe("OrderExpiryService.runSweep race with a payment", () => {
  it("leaves an order alone when a payment moved it out of pending_payment after the query", async () => {
    const prisma = makePrisma([{ id: "o1", orderNumber: "DEM2601050001", items: [{ variantId: "v1", locationId: "loc-1", quantity: 2 }] }], 0);
    const release = vi.fn(() => Promise.resolve());
    const service = new OrderExpiryService(prisma as never, { release } as never, { restoreInTx: vi.fn().mockResolvedValue(0) } as never);

    const result = await service.runSweep();

    expect(result.expired).toBe(0);
    expect(release).not.toHaveBeenCalled();
    expect(prisma._tx.orderEvent.create).not.toHaveBeenCalled();
  });
});
