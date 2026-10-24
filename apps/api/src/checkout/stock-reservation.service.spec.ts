import { describe, expect, it, vi } from "vitest";
import { StockReservationService } from "./stock-reservation.service";

function makeTx(rowCounts: number[]) {
  let call = 0;
  return { $executeRaw: vi.fn(() => Promise.resolve(rowCounts[call++] ?? 1)) };
}

describe("StockReservationService.reserve", () => {
  it("reserves every line when each has enough available stock", async () => {
    const service = new StockReservationService({} as never);
    const tx = makeTx([1, 1]);
    await service.reserve(tx as never, "loc-1", [{ variantId: "v1", quantity: 2 }, { variantId: "v2", quantity: 1 }]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("throws OUT_OF_STOCK when the conditional UPDATE affects zero rows (available < requested)", async () => {
    const service = new StockReservationService({} as never);
    const tx = makeTx([0]);
    await expect(service.reserve(tx as never, "loc-1", [{ variantId: "v1", quantity: 5 }])).rejects.toMatchObject({ response: { code: "OUT_OF_STOCK" } });
  });

  it("stops at the first failing line instead of reserving the rest (the transaction wrapper rolls back whatever succeeded)", async () => {
    const service = new StockReservationService({} as never);
    const tx = makeTx([1, 0, 1]);
    await expect(service.reserve(tx as never, "loc-1", [{ variantId: "v1", quantity: 1 }, { variantId: "v2", quantity: 99 }, { variantId: "v3", quantity: 1 }])).rejects.toThrow();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("skips zero-quantity lines without touching the database", async () => {
    const service = new StockReservationService({} as never);
    const tx = makeTx([]);
    await service.reserve(tx as never, "loc-1", [{ variantId: "v1", quantity: 0 }]);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});

describe("StockReservationService.release", () => {
  it("decrements reserved for every line", async () => {
    const service = new StockReservationService({} as never);
    const tx = makeTx([1, 1]);
    await service.release(tx as never, "loc-1", [{ variantId: "v1", quantity: 2 }, { variantId: "v2", quantity: 1 }]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
