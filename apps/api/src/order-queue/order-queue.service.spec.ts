import { describe, expect, it, vi } from "vitest";
import { OrderQueueService } from "./order-queue.service";

function makeService(opts: { assignedTo?: string | null; staff?: { id: string; lastQueueAssignedAt: Date | null }[]; open?: { assignedTo: string; _count: { _all: number } }[]; claimCount?: number; strategy?: string } = {}) {
  const prisma = {
    order: {
      findUnique: vi.fn(() => Promise.resolve({ id: "o1", assignedTo: opts.assignedTo ?? null })),
      groupBy: vi.fn(() => Promise.resolve(opts.open ?? [])),
      updateMany: vi.fn(() => Promise.resolve({ count: opts.claimCount ?? 1 })),
    },
    staffUser: { findMany: vi.fn(() => Promise.resolve(opts.staff ?? [])), update: vi.fn(() => Promise.resolve({})) },
    orderEvent: { create: vi.fn(() => Promise.resolve({})) },
  };
  const settings = { getValue: vi.fn((key: string) => Promise.resolve(key === "orders.queue.strategy" ? (opts.strategy ?? "round_robin") : false)) };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  return { service: new OrderQueueService(prisma as never, settings as never, audit as never), prisma, audit };
}

describe("OrderQueueService.autoAssign", () => {
  it("does nothing for an order that already has an owner", async () => {
    const { service, prisma } = makeService({ assignedTo: "s9", staff: [{ id: "s1", lastQueueAssignedAt: null }] });
    await expect(service.autoAssign("o1", "placement")).resolves.toBeNull();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });
  it("does nothing when nobody is in the queue", async () => {
    const { service, prisma } = makeService({ staff: [] });
    await expect(service.autoAssign("o1", "placement")).resolves.toBeNull();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });
  it("round-robin hands the order to whoever waited longest and records it", async () => {
    const { service, prisma, audit } = makeService({
      staff: [
        { id: "s1", lastQueueAssignedAt: new Date(2026, 0, 5) },
        { id: "s2", lastQueueAssignedAt: new Date(2026, 0, 2) },
      ],
    });
    await expect(service.autoAssign("o1", "placement")).resolves.toBe("s2");
    expect(prisma.order.updateMany).toHaveBeenCalledWith({ where: { id: "o1", assignedTo: null }, data: { assignedTo: "s2" } });
    expect(prisma.staffUser.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s2" } }));
    expect(prisma.orderEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "assigned" }) }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "order.auto_assign" }));
  });
  it("load-based picks the executive with the fewest open orders", async () => {
    const { service } = makeService({
      strategy: "load_based",
      staff: [
        { id: "s1", lastQueueAssignedAt: null },
        { id: "s2", lastQueueAssignedAt: null },
      ],
      open: [
        { assignedTo: "s1", _count: { _all: 7 } },
        { assignedTo: "s2", _count: { _all: 2 } },
      ],
    });
    await expect(service.autoAssign("o1", "automation")).resolves.toBe("s2");
  });
  it("yields when a concurrent assignment wins the race", async () => {
    const { service, prisma } = makeService({ staff: [{ id: "s1", lastQueueAssignedAt: null }], claimCount: 0 });
    await expect(service.autoAssign("o1", "placement")).resolves.toBeNull();
    expect(prisma.staffUser.update).not.toHaveBeenCalled();
  });
});
