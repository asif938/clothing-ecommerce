import { describe, expect, it, vi } from "vitest";
import { OrderConfirmationService } from "./order-confirmation.service";

const SETTINGS: Record<string, unknown> = { "orders.selfConfirm.expiryHours": 48, "orders.selfConfirm.allowCancel": true };

function makeService(order: Record<string, unknown> | null, settings: Record<string, unknown> = {}) {
  const prisma = {
    order: { findUnique: vi.fn(() => Promise.resolve(order)), update: vi.fn(() => Promise.resolve({})) },
    orderEvent: { create: vi.fn(() => Promise.resolve({})) },
  };
  const merged = { ...SETTINGS, ...settings };
  const settingsService = { getValue: vi.fn((key: string) => Promise.resolve(merged[key])) };
  const notifications = { commonVariables: vi.fn(() => Promise.resolve({ brand_name: "Demo" })), enqueue: vi.fn(() => Promise.resolve()) };
  const lifecycle = { transition: vi.fn(() => Promise.resolve()) };
  const config = { get: vi.fn(() => "https://shop.example/") };
  const service = new OrderConfirmationService(prisma as never, settingsService as never, notifications as never, lifecycle as never, config as never);
  return { service, prisma, notifications, lifecycle };
}

const baseOrder = {
  id: "o1",
  orderNumber: "DEM1",
  status: "pending",
  total: 100000,
  codAmount: 100000,
  customerId: "c1",
  customer: { name: "Rahim", phone: "01712345678", email: null, locale: "bn" },
  billingContact: {},
  confirmationToken: null,
  confirmationRequestedAt: new Date(),
  items: [],
};

describe("OrderConfirmationService.request", () => {
  it("stores a token and queues the confirm link", async () => {
    const { service, prisma, notifications } = makeService(baseOrder);
    await expect(service.request("o1")).resolves.toBe(true);
    const data = (prisma.order.update.mock.calls[0] as unknown as [{ data: { confirmationToken: string } }])[0].data;
    expect(data.confirmationToken.length).toBeGreaterThanOrEqual(30);
    const enqueued = (notifications.enqueue.mock.calls[0] as unknown as [unknown, { event: string; variables: Record<string, string> }])[1];
    expect(enqueued.event).toBe("order_confirmation_request");
    expect(enqueued.variables.confirm_link).toBe(`https://shop.example/confirm-order/${data.confirmationToken}`);
  });
  it("ignores orders that are not pending", async () => {
    const { service, notifications } = makeService({ ...baseOrder, status: "confirmed" });
    await expect(service.request("o1")).resolves.toBe(false);
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });
  it("reuses an existing token", async () => {
    const { service, prisma } = makeService({ ...baseOrder, confirmationToken: "existing-token" });
    await service.request("o1");
    expect((prisma.order.update.mock.calls[0] as unknown as [{ data: { confirmationToken: string } }])[0].data.confirmationToken).toBe("existing-token");
  });
});

describe("OrderConfirmationService.respond", () => {
  it("confirms a pending order as the customer", async () => {
    const { service, lifecycle } = makeService(baseOrder);
    await expect(service.respond("t", "confirm")).resolves.toEqual({ state: "confirmed" });
    expect(lifecycle.transition).toHaveBeenCalledWith({ orderId: "o1", to: "confirmed", actor: { type: "customer", id: "c1" }, reason: undefined });
  });
  it("is idempotent for an already-confirmed order", async () => {
    const { service, lifecycle } = makeService({ ...baseOrder, status: "confirmed" });
    await expect(service.respond("t", "confirm")).resolves.toEqual({ state: "confirmed" });
    expect(lifecycle.transition).not.toHaveBeenCalled();
  });
  it("rejects an expired link", async () => {
    const { service } = makeService({ ...baseOrder, confirmationRequestedAt: new Date(Date.now() - 49 * 3_600_000) });
    await expect(service.respond("t", "confirm")).rejects.toMatchObject({ response: { code: "CONFIRMATION_NOT_OPEN" } });
  });
  it("refuses cancel when the setting is off", async () => {
    const { service } = makeService(baseOrder, { "orders.selfConfirm.allowCancel": false });
    await expect(service.respond("t", "cancel")).rejects.toMatchObject({ response: { code: "CANCEL_NOT_ALLOWED" } });
  });
  it("404s an unknown token", async () => {
    const { service } = makeService(null);
    await expect(service.respond("nope", "confirm")).rejects.toMatchObject({ response: { code: "CONFIRMATION_LINK_INVALID" } });
  });
});
