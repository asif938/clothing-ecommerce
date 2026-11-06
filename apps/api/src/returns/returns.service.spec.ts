import { describe, expect, it, vi } from "vitest";
import { ReturnsService } from "./returns.service";

interface FakeOrderItem {
  id: string;
  sku: string;
  quantity: number;
}

interface FakeOrder {
  id: string;
  customerId: string | null;
  status: string;
  deliveredAt: Date | null;
  items: FakeOrderItem[];
}

function makeService(order: FakeOrder, settings: Record<string, unknown> = {}) {
  const prisma = {
    order: { findUnique: vi.fn(() => Promise.resolve(order)) },
    return: { create: vi.fn((args: { data: unknown }) => Promise.resolve({ id: "ret-1", ...(args.data as object) })) },
    orderEvent: { create: vi.fn() },
  };
  const defaults: Record<string, unknown> = { "returns.enabledTypes": ["refund", "exchange", "store_credit"], "returns.windowDays": 7, ...settings };
  const settingsService = { getValue: vi.fn((key: string) => Promise.resolve(defaults[key])) };
  const audit = { record: vi.fn() };
  const stock = {};
  const orderNumbers = {};
  const service = new ReturnsService(prisma as never, settingsService as never, audit as never, stock as never, orderNumbers as never);
  return { service, prisma };
}

function order(overrides: Partial<FakeOrder> = {}): FakeOrder {
  return {
    id: "order-1",
    customerId: "cust-1",
    status: "delivered",
    deliveredAt: new Date(),
    items: [{ id: "item-1", sku: "SKU-1", quantity: 2 }],
    ...overrides,
  };
}

/** §6.10 return eligibility — the business rule §14 calls out by name. */
describe("ReturnsService.createRequest eligibility", () => {
  it("rejects a return for an order that hasn't been delivered yet", async () => {
    const { service } = makeService(order({ status: "confirmed" }));
    await expect(
      service.createRequest({ orderId: "order-1", type: "refund", reasonCode: "changed_mind", items: [{ orderItemId: "item-1", quantity: 1 }] } as never, "cust-1"),
    ).rejects.toMatchObject({ response: { code: "NOT_DELIVERED" } });
  });

  it("rejects when another customer's id doesn't match the order's owner", async () => {
    const { service } = makeService(order());
    await expect(
      service.createRequest({ orderId: "order-1", type: "refund", reasonCode: "changed_mind", items: [{ orderItemId: "item-1", quantity: 1 }] } as never, "someone-else"),
    ).rejects.toMatchObject({ response: { code: "FORBIDDEN" } });
  });

  it("allows a guest-placed order's return request through when no customerId is supplied", async () => {
    const { service, prisma } = makeService(order());
    await service.createRequest({ orderId: "order-1", type: "refund", reasonCode: "changed_mind", items: [{ orderItemId: "item-1", quantity: 1 }] } as never, null);
    expect(prisma.return.create).toHaveBeenCalled();
  });

  it("rejects a disabled return type", async () => {
    const { service } = makeService(order(), { "returns.enabledTypes": ["refund"] });
    await expect(
      service.createRequest({ orderId: "order-1", type: "exchange", reasonCode: "wrong_size", items: [{ orderItemId: "item-1", quantity: 1, exchangeForVariantId: "v-2" }] } as never, "cust-1"),
    ).rejects.toMatchObject({ response: { code: "RETURN_TYPE_DISABLED" } });
  });

  it("rejects once the return window has passed", async () => {
    const deliveredAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const { service } = makeService(order({ deliveredAt }), { "returns.windowDays": 7 });
    await expect(
      service.createRequest({ orderId: "order-1", type: "refund", reasonCode: "changed_mind", items: [{ orderItemId: "item-1", quantity: 1 }] } as never, "cust-1"),
    ).rejects.toMatchObject({ response: { code: "RETURN_WINDOW_EXPIRED" } });
  });

  it("allows a request made right at the edge of the window", async () => {
    const deliveredAt = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const { service, prisma } = makeService(order({ deliveredAt }), { "returns.windowDays": 7 });
    await service.createRequest({ orderId: "order-1", type: "refund", reasonCode: "changed_mind", items: [{ orderItemId: "item-1", quantity: 1 }] } as never, "cust-1");
    expect(prisma.return.create).toHaveBeenCalled();
  });

  it("rejects a line item that doesn't belong to the order", async () => {
    const { service } = makeService(order());
    await expect(
      service.createRequest({ orderId: "order-1", type: "refund", reasonCode: "changed_mind", items: [{ orderItemId: "not-on-order", quantity: 1 }] } as never, "cust-1"),
    ).rejects.toMatchObject({ response: { code: "INVALID_ITEM" } });
  });

  it("rejects a quantity higher than what was actually ordered", async () => {
    const { service } = makeService(order());
    await expect(
      service.createRequest({ orderId: "order-1", type: "refund", reasonCode: "changed_mind", items: [{ orderItemId: "item-1", quantity: 5 }] } as never, "cust-1"),
    ).rejects.toMatchObject({ response: { code: "INVALID_QUANTITY" } });
  });

  it("requires an exchange target variant for an exchange request", async () => {
    const { service } = makeService(order());
    await expect(
      service.createRequest({ orderId: "order-1", type: "exchange", reasonCode: "wrong_size", items: [{ orderItemId: "item-1", quantity: 1 }] } as never, "cust-1"),
    ).rejects.toMatchObject({ response: { code: "EXCHANGE_VARIANT_REQUIRED" } });
  });

  it("accepts a valid refund request within the window for a delivered order", async () => {
    const { service, prisma } = makeService(order());
    const result = await service.createRequest({ orderId: "order-1", type: "refund", reasonCode: "changed_mind", items: [{ orderItemId: "item-1", quantity: 1 }] } as never, "cust-1");
    expect(result.id).toBe("ret-1");
    expect(prisma.orderEvent.create).toHaveBeenCalled();
  });
});
