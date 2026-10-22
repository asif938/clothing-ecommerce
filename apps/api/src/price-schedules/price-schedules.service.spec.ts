import { describe, expect, it, vi } from "vitest";
import { PriceSchedulesService } from "./price-schedules.service";

function makePrisma(opts: {
  variants: { id: string; price: number }[];
  dueSchedules?: Record<string, unknown>[];
  expiredSchedules?: Record<string, unknown>[];
}) {
  const updatedPrices: Record<string, number> = {};
  return {
    productVariant: {
      findMany: vi.fn(() => Promise.resolve(opts.variants)),
      update: vi.fn(({ where, data }: { where: { id: string }; data: { price: number } }) => {
        updatedPrices[where.id] = data.price;
        return Promise.resolve({ id: where.id, price: data.price });
      }),
    },
    priceSchedule: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce(opts.dueSchedules ?? [])
        .mockResolvedValueOnce(opts.expiredSchedules ?? []),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve(data)),
    },
    __updatedPrices: updatedPrices,
  };
}

describe("PriceSchedulesService.runSweep", () => {
  it("applies a due 'scheduled' schedule to every target variant and snapshots the old prices", async () => {
    const prisma = makePrisma({
      variants: [{ id: "v1", price: 100000 }, { id: "v2", price: 200000 }],
      dueSchedules: [{ id: "ps1", targetType: "variant", targetId: "v1", newPrice: null, percentChange: -10, revertOnEnd: true }],
    });
    const audit = { record: vi.fn() };
    const service = new PriceSchedulesService(prisma as never, audit as never);

    await service.runSweep();

    expect(prisma.priceSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "active", appliedSnapshot: { v1: 100000, v2: 200000 } }) }),
    );
    expect(prisma.__updatedPrices).toEqual({ v1: 90000, v2: 180000 });
  });

  it("reverts prices from the stored snapshot when an active schedule with revertOnEnd ends", async () => {
    const prisma = makePrisma({
      variants: [],
      expiredSchedules: [{ id: "ps2", revertOnEnd: true, appliedSnapshot: { v1: 100000, v2: 200000 } }],
    });
    const audit = { record: vi.fn() };
    const service = new PriceSchedulesService(prisma as never, audit as never);

    await service.runSweep();

    expect(prisma.__updatedPrices).toEqual({ v1: 100000, v2: 200000 });
    expect(prisma.priceSchedule.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "ended" } }));
  });

  it("ends an expired schedule without reverting prices when revertOnEnd is false", async () => {
    const prisma = makePrisma({
      variants: [],
      expiredSchedules: [{ id: "ps3", revertOnEnd: false, appliedSnapshot: { v1: 100000 } }],
    });
    const audit = { record: vi.fn() };
    const service = new PriceSchedulesService(prisma as never, audit as never);

    await service.runSweep();

    expect(prisma.productVariant.update).not.toHaveBeenCalled();
    expect(prisma.priceSchedule.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "ended" } }));
  });
});
