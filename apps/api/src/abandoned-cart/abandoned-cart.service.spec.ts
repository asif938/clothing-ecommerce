import { describe, expect, it, vi } from "vitest";
import { AbandonedCartService } from "./abandoned-cart.service";

const SETTINGS = {
  "marketing.abandonedCart.enabled": true,
  "marketing.abandonedCart.idleMinutes": 60,
  "marketing.abandonedCart.stepDelaysMinutes": [60, 1440, 4320],
  "marketing.abandonedCart.couponStep": 3,
  "marketing.abandonedCart.couponPercentOff": 10,
  "marketing.abandonedCart.couponValidHours": 72,
};

function makeService(overrides: { carts?: unknown[]; settings?: Record<string, unknown> } = {}) {
  const settingsMap = { ...SETTINGS, ...overrides.settings };
  const prisma = {
    cart: {
      findMany: vi.fn(() => Promise.resolve(overrides.carts ?? [])),
      updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
      update: vi.fn(() => Promise.resolve({})),
    },
    discount: { create: vi.fn(() => Promise.resolve({})) },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<void>) => fn(prisma)),
  };
  const settings = { getValue: vi.fn((key: string) => Promise.resolve(settingsMap[key as keyof typeof settingsMap])) };
  const notifications = { commonVariables: vi.fn(() => Promise.resolve({})), enqueue: vi.fn(() => Promise.resolve()) };
  const service = new AbandonedCartService(prisma as never, settings as never, notifications as never);
  return { service, prisma, notifications };
}

describe("AbandonedCartService.markAbandoned", () => {
  it("does nothing when the feature is disabled", async () => {
    const { service, prisma } = makeService({ settings: { "marketing.abandonedCart.enabled": false } });
    const result = await service.markAbandoned();
    expect(result.marked).toBe(0);
    expect(prisma.cart.findMany).not.toHaveBeenCalled();
  });

  it("marks idle, contactable, non-empty carts as abandoned", async () => {
    const { service, prisma } = makeService({ carts: [{ id: "cart-1" }, { id: "cart-2" }] });
    const result = await service.markAbandoned();
    expect(result.marked).toBe(2);
    expect(prisma.cart.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["cart-1", "cart-2"] } }, data: expect.objectContaining({ status: "abandoned" }) });
  });
});

function baseCart(overrides: Record<string, unknown> = {}) {
  return {
    id: "cart-1",
    customerId: null,
    locale: "bn",
    contactName: "Rahim",
    contactPhone: "+8801700000000",
    contactEmail: null,
    recoverySequenceStep: 0,
    abandonedAt: new Date(Date.now() - 65 * 60_000), // 65 minutes ago
    items: [{ addedPrice: 100000, quantity: 1 }],
    ...overrides,
  };
}

describe("AbandonedCartService.runSequence", () => {
  it("sends step 1 once the first delay has elapsed", async () => {
    const { service, notifications, prisma } = makeService({ carts: [baseCart()] });
    const result = await service.runSequence();
    expect(result.sent).toBe(1);
    expect(notifications.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event: "abandoned_cart_1" }));
    expect(prisma.cart.update).toHaveBeenCalledWith({ where: { id: "cart-1" }, data: { recoverySequenceStep: 1 } });
  });

  it("doesn't send before the step's own delay has elapsed", async () => {
    const { service, notifications } = makeService({ carts: [baseCart({ abandonedAt: new Date(Date.now() - 10 * 60_000) })] });
    const result = await service.runSequence();
    expect(result.sent).toBe(0);
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it("measures each step's delay from abandonedAt, not from the previous reminder", async () => {
    // Step 2 fires 1440 min after abandonment regardless of when step 1 actually went out.
    const cart = baseCart({ recoverySequenceStep: 1, abandonedAt: new Date(Date.now() - 1445 * 60_000) });
    const { service, notifications } = makeService({ carts: [cart] });
    const result = await service.runSequence();
    expect(result.sent).toBe(1);
    expect(notifications.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event: "abandoned_cart_2" }));
  });

  it("attaches a coupon only on the configured step", async () => {
    const cart = baseCart({ recoverySequenceStep: 2, abandonedAt: new Date(Date.now() - 4330 * 60_000) });
    const { service, notifications, prisma } = makeService({ carts: [cart] });
    await service.runSequence();
    expect(notifications.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ event: "abandoned_cart_3", variables: expect.objectContaining({ coupon_code: expect.stringMatching(/^COMEBACK/) }) }));
    expect(prisma.discount.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ valueType: "percent", value: 10 }) }));
  });

  it("stops after the sequence length — never sends a 4th reminder", async () => {
    const cart = baseCart({ recoverySequenceStep: 3 });
    const { service, notifications, prisma } = makeService({ carts: [cart] });
    // findMany's own where clause excludes step >= 3 in real usage; this
    // guards the service's own loop logic in case that filter is ever loosened.
    await service.runSequence();
    expect(prisma.cart.findMany).toHaveBeenCalled();
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });
});
