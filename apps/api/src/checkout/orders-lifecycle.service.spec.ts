import { describe, expect, it, vi } from "vitest";
import { OrdersLifecycleService } from "./orders-lifecycle.service";

interface FakeOrder {
  id: string;
  orderNumber: string;
  status: string;
  paidTotal: number;
  reservationReleasedAt: Date | null;
  deliveredAt: Date | null;
  items: { variantId: string; locationId: string; quantity: number }[];
  payments: { id: string; status: string }[];
  customerId: string | null;
  customer: { name: string; phone: string | null; email: string | null; locale: string } | null;
  billingContact: Record<string, unknown>;
  total: number;
  codAmount: number;
}

function makeTx(order: FakeOrder) {
  return {
    order: { findUniqueOrThrow: vi.fn(() => Promise.resolve(order)), update: vi.fn() },
    orderEvent: { create: vi.fn() },
    refund: { create: vi.fn() },
    discountUsage: { deleteMany: vi.fn() },
    shipment: { findFirst: vi.fn(() => Promise.resolve(null)) },
  };
}

function makeService(order: FakeOrder, settings: Record<string, unknown> = {}) {
  const tx = makeTx(order);
  const prisma = { $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(tx)) };
  const settingsService = { getValue: vi.fn((key: string) => Promise.resolve(settings[key])) };
  const audit = { record: vi.fn() };
  const stock = { release: vi.fn(() => Promise.resolve()) };
  const notifications = { commonVariables: vi.fn(() => Promise.resolve({ brand_name: "Demo Fashion", support_phone: "01700-000000" })), enqueue: vi.fn(() => Promise.resolve()) };
  const service = new OrdersLifecycleService(prisma as never, settingsService as never, audit as never, stock as never, notifications as never);
  return { service, tx, prisma, audit, stock, notifications };
}

function order(overrides: Partial<FakeOrder> = {}): FakeOrder {
  return {
    id: "o1",
    orderNumber: "DEM2601050001",
    status: "pending",
    paidTotal: 0,
    reservationReleasedAt: null,
    deliveredAt: null,
    items: [{ variantId: "v1", locationId: "loc-1", quantity: 2 }],
    payments: [],
    customerId: "c1",
    customer: { name: "Rahim", phone: "+8801700000000", email: null, locale: "bn" },
    billingContact: {},
    total: 150000,
    codAmount: 150000,
    ...overrides,
  };
}

describe("OrdersLifecycleService.transition", () => {
  it("rejects a move that isn't in ALLOWED_TRANSITIONS", async () => {
    const { service } = makeService(order({ status: "pending" }));
    await expect(service.transition({ orderId: "o1", to: "shipped", actor: { type: "system" } })).rejects.toMatchObject({ response: { code: "INVALID_TRANSITION" } });
  });

  it("allows pending → confirmed and records the staff actor", async () => {
    const { service, tx } = makeService(order({ status: "pending" }));
    await service.transition({ orderId: "o1", to: "confirmed", actor: { type: "staff", id: "staff-1" } });
    expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "confirmed", confirmedBy: "staff-1" }) }));
  });

  it("enqueues an order_confirmed notification for the customer", async () => {
    const { service, notifications } = makeService(order({ status: "pending" }));
    await service.transition({ orderId: "o1", to: "confirmed", actor: { type: "staff", id: "staff-1" } });
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: "order_confirmed", recipientType: "customer", recipientId: "c1", contacts: { sms: "+8801700000000", whatsapp: "+8801700000000", email: null } }),
    );
  });

  it("does not enqueue a notification for a transition with no mapped event", async () => {
    const { service, notifications } = makeService(order({ status: "pending" }));
    await service.transition({ orderId: "o1", to: "on_hold", actor: { type: "staff", id: "staff-1" }, reason: "Suspicious order" });
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it("requires a reason to put an order on hold", async () => {
    const { service } = makeService(order({ status: "pending" }));
    await expect(service.transition({ orderId: "o1", to: "on_hold", actor: { type: "staff", id: "staff-1" } })).rejects.toMatchObject({ response: { code: "REASON_REQUIRED" } });
  });

  it("requires a reason for a staff-initiated cancellation", async () => {
    const { service } = makeService(order({ status: "pending" }));
    await expect(service.transition({ orderId: "o1", to: "cancelled", actor: { type: "staff", id: "staff-1" } })).rejects.toMatchObject({ response: { code: "REASON_REQUIRED" } });
  });

  it("does not require a reason for a system/customer-initiated cancellation", async () => {
    const { service } = makeService(order({ status: "pending" }));
    await expect(service.transition({ orderId: "o1", to: "cancelled", actor: { type: "customer", id: "c1" } })).resolves.toBeUndefined();
  });

  it("releases stock (grouped by location) on cancellation", async () => {
    const { service, tx, stock } = makeService(
      order({ status: "confirmed", items: [{ variantId: "v1", locationId: "loc-1", quantity: 1 }, { variantId: "v2", locationId: "loc-1", quantity: 3 }] }),
    );
    await service.transition({ orderId: "o1", to: "cancelled", actor: { type: "staff", id: "staff-1" }, reason: "Customer changed mind" });
    expect(stock.release).toHaveBeenCalledTimes(1);
    expect(stock.release).toHaveBeenCalledWith(tx, "loc-1", [{ variantId: "v1", quantity: 1 }, { variantId: "v2", quantity: 3 }]);
    expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reservationReleasedAt: expect.any(Date) }) }));
  });

  it("does not release stock again when it was already released", async () => {
    const { service, stock } = makeService(order({ status: "pending_payment", reservationReleasedAt: new Date() }));
    await service.transition({ orderId: "o1", to: "cancelled", actor: { type: "system" } });
    expect(stock.release).not.toHaveBeenCalled();
  });

  it("creates a pending refund for any amount already paid", async () => {
    const { service, tx } = makeService(order({ status: "confirmed", paidTotal: 50000, payments: [{ id: "pay-1", status: "succeeded" }] }));
    await service.transition({ orderId: "o1", to: "cancelled", actor: { type: "staff", id: "staff-1" }, reason: "Out of stock" });
    expect(tx.refund.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ orderId: "o1", paymentId: "pay-1", amount: 50000, status: "pending" }) }));
  });

  it("creates no refund when nothing was paid", async () => {
    const { service, tx } = makeService(order({ status: "confirmed", paidTotal: 0 }));
    await service.transition({ orderId: "o1", to: "cancelled", actor: { type: "staff", id: "staff-1" }, reason: "Changed mind" });
    expect(tx.refund.create).not.toHaveBeenCalled();
  });

  it("releases coupon usage on cancellation when the setting is on", async () => {
    const { service, tx } = makeService(order({ status: "confirmed" }), { "orders.releaseCouponUsageOnCancel": true });
    await service.transition({ orderId: "o1", to: "cancelled", actor: { type: "staff", id: "staff-1" }, reason: "Duplicate order" });
    expect(tx.discountUsage.deleteMany).toHaveBeenCalledWith({ where: { orderId: "o1" } });
  });

  it("leaves coupon usage alone when the setting is off", async () => {
    const { service, tx } = makeService(order({ status: "confirmed" }), { "orders.releaseCouponUsageOnCancel": false });
    await service.transition({ orderId: "o1", to: "cancelled", actor: { type: "staff", id: "staff-1" }, reason: "Duplicate order" });
    expect(tx.discountUsage.deleteMany).not.toHaveBeenCalled();
  });

  it("stamps deliveredAt the first time an order is delivered, not again on a later call", async () => {
    const { service: first, tx: tx1 } = makeService(order({ status: "shipped", deliveredAt: null }));
    await first.transition({ orderId: "o1", to: "delivered", actor: { type: "system" } });
    expect(tx1.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ deliveredAt: expect.any(Date) }) }));
  });

  it("does not overwrite an existing deliveredAt", async () => {
    const existing = new Date("2026-01-01T00:00:00Z");
    const { service, tx } = makeService(order({ status: "out_for_delivery", deliveredAt: existing }));
    await service.transition({ orderId: "o1", to: "delivered", actor: { type: "system" } });
    const call = tx.order.update.mock.calls[0]?.[0];
    expect(call.data.deliveredAt).toBeUndefined();
  });

  it("enqueues an order_cancelled notification, falling back to the billing contact for a guest order", async () => {
    const { service, notifications } = makeService(order({ status: "confirmed", customerId: null, customer: null, billingContact: { name: "Karim", phone: "+8801800000000" } }));
    await service.transition({ orderId: "o1", to: "cancelled", actor: { type: "staff", id: "staff-1" }, reason: "Out of stock" });
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: "order_cancelled", recipientType: "guest", recipientId: null, contacts: { sms: "+8801800000000", whatsapp: "+8801800000000", email: null } }),
    );
  });
});
