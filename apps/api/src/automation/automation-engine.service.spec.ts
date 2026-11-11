import { describe, expect, it, vi } from "vitest";
import { AutomationEngineService } from "./automation-engine.service";

const ORDER = {
  id: "o1",
  orderNumber: "DEM1",
  status: "pending",
  tags: [] as string[],
  customerId: "c1",
  customer: { id: "c1", name: "Rahim", phone: "01712345678", email: null, locale: "bn", tags: [] as string[], rejectedAtDoorCount: 0 },
  billingContact: {},
  total: 2_000_000,
  codAmount: 2_000_000,
};

interface RuleRow {
  id: string;
  name: string;
  actions: unknown[];
  conditions: unknown;
  stopProcessing?: boolean;
}

function makeEngine(rules: RuleRow[], opts: { recentRuns?: number; settings?: Record<string, unknown> } = {}) {
  const prisma = {
    automationRule: { findMany: vi.fn(() => Promise.resolve(rules)), update: vi.fn(() => Promise.resolve({})) },
    automationRun: { count: vi.fn(() => Promise.resolve(opts.recentRuns ?? 0)), create: vi.fn(() => Promise.resolve({})) },
    orderEvent: { create: vi.fn(() => Promise.resolve({})) },
    order: { update: vi.fn(() => Promise.resolve({})) },
    customer: { update: vi.fn(() => Promise.resolve({})) },
    staffUser: { findFirst: vi.fn(() => Promise.resolve({ id: "s1" })) },
  };
  const settings = { getValue: vi.fn((key: string) => Promise.resolve(opts.settings?.[key] ?? false)) };
  const lifecycle = { transition: vi.fn(() => Promise.resolve()) };
  const staffNotifications = { notifyStaffWithPermission: vi.fn(() => Promise.resolve()) };
  const queue = { autoAssign: vi.fn(() => Promise.resolve("s1")) };
  const confirmation = { request: vi.fn(() => Promise.resolve(true)) };
  const orderContext = {
    forOrder: vi.fn(() =>
      Promise.resolve({
        order: ORDER,
        context: { "order.total": ORDER.total, "order.riskLevel": "low", "customer.rejectedAtDoorCount": 3, "order.tags": [] },
      }),
    ),
  };
  const engine = new AutomationEngineService(
    prisma as never,
    settings as never,
    { record: vi.fn() } as never,
    lifecycle as never,
    { commonVariables: vi.fn(() => Promise.resolve({})), enqueue: vi.fn() } as never,
    staffNotifications as never,
    orderContext as never,
    queue as never,
    confirmation as never,
  );
  return { engine, prisma, lifecycle, staffNotifications, queue, confirmation };
}

const matchAll = { match: "all", rules: [] };

describe("AutomationEngineService.runRules", () => {
  it("runs the actions of a matching rule and records the run", async () => {
    const { engine, prisma, lifecycle } = makeEngine([
      { id: "r1", name: "Confirm", conditions: { match: "all", rules: [{ field: "order.total", op: "gte", value: 1_000_000 }] }, actions: [{ type: "set_status", status: "confirmed" }, { type: "add_tag", tag: "vip", target: "order" }] },
    ]);
    await expect(engine.runRules("order.placed", "o1")).resolves.toEqual({ matched: 1 });
    expect(lifecycle.transition).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o1", to: "confirmed", actor: { type: "system" } }));
    expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: "o1" }, data: { tags: ["vip"] } });
    expect(prisma.automationRun.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ruleId: "r1", status: "matched" }) }));
    expect(prisma.automationRule.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { runCount: { increment: 1 } } });
  });

  it("skips a rule whose conditions fail", async () => {
    const { engine, lifecycle, prisma } = makeEngine([{ id: "r1", name: "Low", conditions: { match: "all", rules: [{ field: "order.total", op: "lt", value: 100 }] }, actions: [{ type: "set_status", status: "confirmed" }] }]);
    await expect(engine.runRules("order.placed", "o1")).resolves.toEqual({ matched: 0 });
    expect(lifecycle.transition).not.toHaveBeenCalled();
    expect(prisma.automationRun.create).not.toHaveBeenCalled();
  });

  it("stops after a rule with stopProcessing", async () => {
    const { engine, lifecycle } = makeEngine([
      { id: "r1", name: "First", conditions: matchAll, stopProcessing: true, actions: [{ type: "add_note", note: "x" }] },
      { id: "r2", name: "Second", conditions: matchAll, actions: [{ type: "set_status", status: "cancelled" }] },
    ]);
    await expect(engine.runRules("order.placed", "o1")).resolves.toEqual({ matched: 1 });
    expect(lifecycle.transition).not.toHaveBeenCalled();
  });

  it("records a failed run and halts that rule's remaining actions when an action throws", async () => {
    const { engine, lifecycle, prisma } = makeEngine([{ id: "r1", name: "Boom", conditions: matchAll, actions: [{ type: "set_status", status: "confirmed" }, { type: "add_note", note: "after" }] }]);
    lifecycle.transition.mockRejectedValueOnce(new Error("INVALID_TRANSITION"));
    await engine.runRules("order.placed", "o1");
    expect(prisma.automationRun.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed", error: expect.stringContaining("INVALID_TRANSITION") }) }));
    expect(prisma.orderEvent.create).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "note" }) }));
  });

  it("loop guard: a rule that already fired too often for this order is skipped, not executed", async () => {
    const { engine, lifecycle, prisma } = makeEngine([{ id: "r1", name: "Flip", conditions: matchAll, actions: [{ type: "set_status", status: "on_hold" }] }], { recentRuns: 3 });
    await expect(engine.runRules("order.placed", "o1")).resolves.toEqual({ matched: 0 });
    expect(lifecycle.transition).not.toHaveBeenCalled();
    expect(prisma.automationRun.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "skipped" }) }));
  });

  it("customer-targeted tag actions update the customer", async () => {
    const { engine, prisma } = makeEngine([{ id: "r1", name: "Risky", conditions: { match: "all", rules: [{ field: "customer.rejectedAtDoorCount", op: "gte", value: 3 }] }, actions: [{ type: "add_tag", tag: "risky", target: "customer" }] }]);
    await engine.runRules("order.rejected_at_door", "o1");
    expect(prisma.customer.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { tags: ["risky"] } });
  });
});

describe("AutomationEngineService.handle", () => {
  it("runs the placement built-ins only for order.placed and only when their settings are on", async () => {
    const on = makeEngine([], { settings: { "orders.queue.autoAssign": true, "orders.selfConfirm.enabled": true } });
    await on.engine.handle({ trigger: "order.placed", orderId: "o1" });
    expect(on.queue.autoAssign).toHaveBeenCalledWith("o1", "placement");
    expect(on.confirmation.request).toHaveBeenCalledWith("o1");

    const off = makeEngine([]);
    await off.engine.handle({ trigger: "order.placed", orderId: "o1" });
    expect(off.queue.autoAssign).not.toHaveBeenCalled();
    expect(off.confirmation.request).not.toHaveBeenCalled();

    const other = makeEngine([], { settings: { "orders.queue.autoAssign": true } });
    await other.engine.handle({ trigger: "order.confirmed", orderId: "o1" });
    expect(other.queue.autoAssign).not.toHaveBeenCalled();
  });

  it("a failing built-in does not stop the rules from running", async () => {
    const { engine, queue, prisma } = makeEngine([], { settings: { "orders.queue.autoAssign": true } });
    queue.autoAssign.mockRejectedValueOnce(new Error("db down"));
    await expect(engine.handle({ trigger: "order.placed", orderId: "o1" })).resolves.toBeUndefined();
    expect(prisma.automationRule.findMany).toHaveBeenCalled();
  });
});
