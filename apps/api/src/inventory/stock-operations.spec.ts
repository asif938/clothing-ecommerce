import { describe, expect, it, vi } from "vitest";
import { InventoryService } from "./inventory.service";
import { StockTransfersService } from "./stock-transfers.service";
import { StockTakesService } from "./stock-takes.service";

const actor = { id: "staff-1", name: "A", email: "a@x", locale: "en", permissions: new Set<string>(), isSuperAdmin: false, totpEnabled: true };

function movementMock() {
  return {
    applyMovementTx: vi.fn((_tx: unknown, input: { variantId: string; quantity: number }) => Promise.resolve({ variantId: input.variantId, onHandBefore: 0, onHandAfter: input.quantity, becameAvailable: input.quantity > 0 })),
    afterMovementsCommitted: vi.fn(() => Promise.resolve()),
  };
}

describe("InventoryService.applyMovementTx", () => {
  function make(level: { id: string; onHand: number; available: number }, updateManyCount = 1, after = { onHand: 0, available: 0 }) {
    const tx = {
      inventoryLevel: {
        upsert: vi.fn(() => Promise.resolve(level)),
        updateMany: vi.fn(() => Promise.resolve({ count: updateManyCount })),
        update: vi.fn(() => Promise.resolve({})),
        findUniqueOrThrow: vi.fn(() => Promise.resolve({ ...level, ...after })),
      },
      stockMovement: { create: vi.fn(() => Promise.resolve({})) },
    };
    const service = new InventoryService({} as never, {} as never, { fulfillForVariant: vi.fn() } as never);
    return { service, tx };
  }

  it("guards decrements on available stock when asked, and records the movement", async () => {
    const { service, tx } = make({ id: "l1", onHand: 5, available: 3 }, 1, { onHand: 2, available: 0 });
    const result = await service.applyMovementTx(tx as never, { variantId: "v1", locationId: "loc", quantity: -3, reason: "transfer_out", requireAvailable: true });
    expect(tx.inventoryLevel.updateMany).toHaveBeenCalledWith({ where: { id: "l1", available: { gte: 3 } }, data: { onHand: { increment: -3 } } });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ quantity: -3, reason: "transfer_out" }) });
    expect(result).toEqual({ variantId: "v1", onHandBefore: 5, onHandAfter: 2, becameAvailable: false });
  });

  it("throws INSUFFICIENT_STOCK when the guarded update matches nothing", async () => {
    const { service, tx } = make({ id: "l1", onHand: 1, available: 1 }, 0);
    await expect(service.applyMovementTx(tx as never, { variantId: "v1", locationId: "loc", quantity: -3, reason: "stock_take" })).rejects.toMatchObject({ response: { code: "INSUFFICIENT_STOCK" } });
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("reports a back-in-stock crossing", async () => {
    const { service, tx } = make({ id: "l1", onHand: 0, available: 0 }, 1, { onHand: 4, available: 4 });
    const result = await service.applyMovementTx(tx as never, { variantId: "v1", locationId: "loc", quantity: 4, reason: "purchase_receive" });
    expect(tx.inventoryLevel.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { onHand: { increment: 4 } } });
    expect(result.becameAvailable).toBe(true);
  });
});

describe("StockTransfersService", () => {
  function make(transfer: Record<string, unknown>, claim = 1) {
    const tx = {
      stockTransfer: { updateMany: vi.fn(() => Promise.resolve({ count: claim })), findUniqueOrThrow: vi.fn(() => Promise.resolve(transfer)), findUnique: vi.fn(() => Promise.resolve(transfer)) },
      stockTransferItem: { update: vi.fn(() => Promise.resolve({})) },
    };
    const prisma = { $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)), stockTransfer: { findUnique: vi.fn(() => Promise.resolve(transfer)) } };
    const inventory = movementMock();
    const audit = { record: vi.fn(() => Promise.resolve()) };
    return { service: new StockTransfersService(prisma as never, audit as never, inventory as never), tx, inventory, audit };
  }
  const transfer = { id: "t1", number: "TR-1", status: "in_transit", fromLocationId: "A", toLocationId: "B", items: [{ id: "i1", variantId: "v1", quantity: 5 }, { id: "i2", variantId: "v2", quantity: 2 }] };

  it("dispatch takes available stock out of the source", async () => {
    const { service, inventory } = make({ ...transfer, status: "draft" });
    await service.dispatch("t1", actor);
    expect(inventory.applyMovementTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ variantId: "v1", locationId: "A", quantity: -5, reason: "transfer_out", requireAvailable: true }));
  });

  it("dispatch refuses anything but a draft", async () => {
    const { service } = make(transfer, 0);
    await expect(service.dispatch("t1", actor)).rejects.toMatchObject({ response: { code: "TRANSFER_NOT_DRAFT" } });
  });

  it("receive books what arrived and records the shortfall", async () => {
    const { service, inventory, tx, audit } = make(transfer);
    await service.receive("t1", { lines: [{ variantId: "v1", quantity: 4 }] }, actor);
    expect(inventory.applyMovementTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ variantId: "v1", locationId: "B", quantity: 4, reason: "transfer_in" }));
    expect(inventory.applyMovementTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ variantId: "v2", quantity: 2 }));
    expect(tx.stockTransferItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { quantityReceived: 4 } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "stock_transfer.receive", after: expect.objectContaining({ shortfalls: [{ variantId: "v1", sent: 5, received: 4 }] }) }));
  });

  it("receive refuses more than was sent", async () => {
    const { service } = make(transfer);
    await expect(service.receive("t1", { lines: [{ variantId: "v1", quantity: 6 }] }, actor)).rejects.toMatchObject({ response: { code: "OVER_RECEIPT" } });
  });

  it("cancelling an in-transit transfer returns the stock to the source", async () => {
    const { service, inventory } = make(transfer);
    await service.cancel("t1", actor);
    expect(inventory.applyMovementTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ variantId: "v1", locationId: "A", quantity: 5 }));
  });
});

describe("StockTakesService.apply", () => {
  function make(lines: { id: string; variantId: string; expectedQty: number; countedQty: number | null }[], onHand: Record<string, number>, claim = 1) {
    const tx = {
      stockTake: { updateMany: vi.fn(() => Promise.resolve({ count: claim })), findUniqueOrThrow: vi.fn(() => Promise.resolve({ id: "st1", number: "ST-1", locationId: "loc", lines })) },
      stockTakeLine: { update: vi.fn(() => Promise.resolve({})) },
      inventoryLevel: { findUnique: vi.fn((args: { where: { variantId_locationId: { variantId: string } } }) => Promise.resolve({ onHand: onHand[args.where.variantId_locationId.variantId] ?? 0 })) },
    };
    const prisma = {
      $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      stockTake: { findUnique: vi.fn(() => Promise.resolve({ id: "st1", lines: [], location: null })) },
    };
    const inventory = movementMock();
    const audit = { record: vi.fn(() => Promise.resolve()) };
    return { service: new StockTakesService(prisma as never, audit as never, inventory as never), inventory, tx };
  }

  it("applies counted − snapshot to current on hand and skips uncounted lines", async () => {
    const { service, inventory } = make(
      [
        { id: "a", variantId: "v1", expectedQty: 10, countedQty: 8 },
        { id: "b", variantId: "v2", expectedQty: 3, countedQty: 3 },
        { id: "c", variantId: "v3", expectedQty: 4, countedQty: null },
      ],
      { v1: 7, v2: 3, v3: 4 },
    );
    await service.apply("st1", { zeroUncounted: false }, actor).catch(() => undefined);
    expect(inventory.applyMovementTx).toHaveBeenCalledTimes(1);
    expect(inventory.applyMovementTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ variantId: "v1", quantity: -2, reason: "stock_take" }));
  });

  it("zeroes uncounted lines when asked", async () => {
    const { service, inventory, tx } = make([{ id: "c", variantId: "v3", expectedQty: 4, countedQty: null }], { v3: 4 });
    await service.apply("st1", { zeroUncounted: true }, actor).catch(() => undefined);
    expect(tx.stockTakeLine.update).toHaveBeenCalledWith({ where: { id: "c" }, data: { countedQty: 0, countedAt: expect.any(Date) } });
    expect(inventory.applyMovementTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ variantId: "v3", quantity: -4 }));
  });

  it("can't be applied twice", async () => {
    const { service } = make([], {}, 0);
    await expect(service.apply("st1", { zeroUncounted: false }, actor)).rejects.toMatchObject({ response: { code: "STOCK_TAKE_CLOSED" } });
  });
});
