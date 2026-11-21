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
  currency: string;
  trackingEventId: string | null;
}

function makeTx(order: FakeOrder) {
  return {
    order: { findUniqueOrThrow: vi.fn(() => Promise.resolve(order)), findUnique: vi.fn(() => Promise.resolve(order)), update: vi.fn(), updateMany: vi.fn(() => Promise.resolve({ count: 1 })) },
    orderEvent: { create: vi.fn() },
    refund: { create: vi.fn() },
    discountUsage: { deleteMany: vi.fn(), findMany: vi.fn(() => Promise.resolve([] as { discountId: string; code: string | null }[])) },
    discount: { updateMany: vi.fn() },
    discountCode: { updateMany: vi.fn() },
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
  const tracking = { recordPurchase: vi.fn(() => Promise.resolve()) };
  const automationOutbox = { enqueue: vi.fn(() => Promise.resolve()) };
  const staffNotifications = { notifyPaymentFailed: vi.fn(() => Promise.resolve()), notifyPaymentNeedsRefund: vi.fn(() => Promise.resolve()) };
  const tenders = { restoreInTx: vi.fn(() => Promise.resolve(0)) };
  const service = new OrdersLifecycleService(prisma as never, settingsService as never, audit as never, stock as never, notifications as never, tracking as never, automationOutbox as never, staffNotifications as never, tenders as never);
  return { service, tx, prisma, audit, stock, notifications, tracking, automationOutbox, tenders, staffNotifications };
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
    currency: "BDT",
    trackingEventId: "evt-1",
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

  it("fires the server-side Purchase tracking event on confirm when timing is set to confirmation", async () => {
    const { service, tracking } = makeService(order({ status: "pending", trackingEventId: "evt-42" }), { "tracking.purchaseEventTiming": "confirmation" });
    await service.transition({ orderId: "o1", to: "confirmed", actor: { type: "staff", id: "staff-1" } });
    expect(tracking.recordPurchase).toHaveBeenCalledWith(expect.objectContaining({ eventId: "evt-42", orderId: "o1", total: 150000, currency: "BDT" }));
  });

  it("does not fire the tracking event on confirm when timing is set to placement (the default)", async () => {
    const { service, tracking } = makeService(order({ status: "pending" }), { "tracking.purchaseEventTiming": "placement" });
    await service.transition({ orderId: "o1", to: "confirmed", actor: { type: "staff", id: "staff-1" } });
    expect(tracking.recordPurchase).not.toHaveBeenCalled();
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

  it("returns gift card / store credit tenders directly and only refunds the cash part (§16 M16)", async () => {
    const { service, tx, tenders } = makeService(
      order({ status: "confirmed", paidTotal: 80000, payments: [{ id: "pay-gc", status: "succeeded", method: "gift_card" } as never, { id: "pay-1", status: "succeeded", method: "bkash" } as never] }),
    );
    tenders.restoreInTx.mockResolvedValue(30000);
    await service.transition({ orderId: "o1", to: "cancelled", actor: { type: "staff", id: "staff-1" }, reason: "Out of stock" });
    expect(tenders.restoreInTx).toHaveBeenCalled();
    expect(tx.refund.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ paymentId: "pay-1", amount: 50000 }) }));
    expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "cancelled", paidTotal: 50000 }) }));
  });

  it("creates no refund record when the whole order was paid with credit", async () => {
    const { service, tx, tenders } = makeService(order({ status: "confirmed", paidTotal: 30000, payments: [{ id: "pay-sc", status: "succeeded", method: "store_credit" } as never] }));
    tenders.restoreInTx.mockResolvedValue(30000);
    await service.transition({ orderId: "o1", to: "cancelled", actor: { type: "staff", id: "staff-1" }, reason: "Changed mind" });
    expect(tx.refund.create).not.toHaveBeenCalled();
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

describe("OrdersLifecycleService payment settlement", () => {
  const paymentOrder = (overrides: Record<string, unknown> = {}) => ({ ...order({ status: "pending_payment", total: 100000 }), riskLevel: "low", advancePaid: 0, ...overrides }) as unknown as FakeOrder;

  it("moves a pending_payment order to pending and credits the payment", async () => {
    const { service, tx, automationOutbox } = makeService(paymentOrder());
    await service.onPaymentSucceeded("o1", "full", 100000, "p1");
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o1", status: "pending_payment" }, data: expect.objectContaining({ status: "pending", paidTotal: 100000, paymentStatus: "paid" }) }),
    );
    expect(automationOutbox.enqueue).toHaveBeenCalledWith(tx, "order.placed", "o1");
    expect(tx.refund.create).not.toHaveBeenCalled();
  });

  it("opens a refund instead of dropping money paid for an expired order", async () => {
    const { service, tx, staffNotifications, automationOutbox } = makeService(paymentOrder({ status: "expired" }));
    await service.onPaymentSucceeded("o1", "full", 100000, "p1");
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ paidTotal: 100000 }) }));
    expect(tx.refund.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ orderId: "o1", paymentId: "p1", amount: 100000, status: "pending" }) }));
    expect(staffNotifications.notifyPaymentNeedsRefund).toHaveBeenCalled();
    expect(automationOutbox.enqueue).not.toHaveBeenCalled();
  });

  it("treats a payment that lost the race (the order moved meanwhile) as a refund, never a second credit", async () => {
    const { service, tx } = makeService(paymentOrder());
    tx.order.updateMany.mockResolvedValueOnce({ count: 0 });
    await service.onPaymentSucceeded("o1", "full", 100000, "p2");
    expect(tx.refund.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ paymentId: "p2", amount: 100000 }) }));
  });

  it("records an amount mismatch and refunds what the gateway actually took", async () => {
    const { service, tx, staffNotifications } = makeService(paymentOrder());
    await service.onPaymentAmountMismatch("o1", "p1", 100000, 1000);
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.refund.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 1000, paymentId: "p1" }) }));
    expect(staffNotifications.notifyPaymentNeedsRefund).toHaveBeenCalled();
  });

  it("gives discount counters back when a cancellation releases coupon usage", async () => {
    const { service, tx } = makeService(order({ status: "pending" }), { "orders.releaseCouponUsageOnCancel": true });
    tx.discountUsage.findMany.mockResolvedValueOnce([{ discountId: "d1", code: "VIPAB12" }]);
    await service.transition({ orderId: "o1", to: "cancelled", actor: { type: "customer", id: "c1" } });
    expect(tx.discount.updateMany).toHaveBeenCalledWith({ where: { id: "d1", usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
    expect(tx.discountCode.updateMany).toHaveBeenCalledWith({ where: { code: "VIPAB12", discountId: "d1", usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
  });
});
