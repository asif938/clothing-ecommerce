import { describe, expect, it, vi } from "vitest";
import { ReviewRequestService, reviewRequestContact } from "./review-request.service";
import { StoreReviewsService } from "./store-reviews.service";
import { signReviewToken } from "./review-link";

const KEY = "test-encryption-key-0123456789";
const NOW = new Date("2026-11-24T06:00:00Z");

function settings(values: Record<string, unknown>) {
  return { getValue: vi.fn((key: string) => Promise.resolve(values[key])) };
}

function makeSweep(opts: { enabled?: boolean; asked?: string[]; journey?: string[]; orders?: unknown[] } = {}) {
  const create = vi.fn().mockResolvedValue({});
  const orders = (opts.orders ?? [
    { id: "ordguest001", orderNumber: "N-1001", customerId: null, billingContact: { name: "Rina", phone: "01711111111" }, customer: null },
    { id: "ordcust0002", orderNumber: "N-1002", customerId: "cust1", billingContact: { phone: "01700000000" }, customer: { name: "Karim", phone: "01822222222", email: null, locale: "en" } },
  ]) as { id: string }[];
  const prisma = {
    order: {
      findMany: vi.fn((args: { select: Record<string, unknown> }) => Promise.resolve(Object.keys(args.select).length === 1 ? orders.map((o) => ({ id: o.id })) : orders)),
    },
    notificationLog: { findMany: vi.fn().mockResolvedValue((opts.asked ?? []).map((id) => ({ relatedEntityId: id }))), create },
    journeyEnrollment: { findMany: vi.fn().mockResolvedValue((opts.journey ?? []).map((id) => ({ orderId: id }))) },
  };
  const s = settings({
    "reviews.requestEnabled": opts.enabled ?? true,
    "reviews.requestDelayDays": "3",
    "reviews.requestChannel": "sms",
    "reviews.requestMessage": { bn: "{customer_name} {order_number} {review_link}", en: "Hi {customer_name}, {order_number}: {review_link}" },
  });
  const notifications = { commonVariables: vi.fn().mockResolvedValue({ brand_name: "Noksha", support_phone: "" }) };
  const storeReviews = { reviewToken: (id: string) => signReviewToken(id, KEY) };
  const service = new ReviewRequestService(prisma as never, s as never, notifications as never, storeReviews as never);
  return { service, prisma, create };
}

describe("ReviewRequestService.sweep", () => {
  it("does nothing while the setting is off", async () => {
    const { service, prisma } = makeSweep({ enabled: false });
    expect(await service.sweep(NOW)).toEqual({ queued: 0 });
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it("only looks at orders delivered between delay+7 and delay days ago that still have an unreviewed item", async () => {
    const { service, prisma } = makeSweep();
    await service.sweep(NOW);
    const where = (prisma.order.findMany.mock.calls[0]![0] as unknown as { where: { deliveredAt: { gte: Date; lte: Date } } }).where;
    expect(where.deliveredAt.lte.toISOString()).toBe("2026-11-21T06:00:00.000Z");
    expect(where.deliveredAt.gte.toISOString()).toBe("2026-11-14T06:00:00.000Z");
    expect(JSON.stringify(where)).toContain('"reviews":{"none":{}}');
  });

  it("asks guest and account orders once each, with a working review link", async () => {
    const { service, create } = makeSweep();
    expect(await service.sweep(NOW)).toEqual({ queued: 2 });
    const guest = create.mock.calls[0]![0].data;
    expect(guest).toMatchObject({ event: "journey_message", channel: "sms", recipientType: "guest", to: "01711111111", relatedEntityType: "review_request", relatedEntityId: "ordguest001", locale: "bn" });
    expect(guest.body).toContain("Rina N-1001 ");
    expect(guest.body).toContain(`/review/${signReviewToken("ordguest001", KEY)}`);
    const account = create.mock.calls[1]![0].data;
    expect(account).toMatchObject({ recipientType: "customer", recipientId: "cust1", to: "01822222222", locale: "en" });
    expect(account.body).toContain("/en/review/");
  });

  it("skips orders already asked or handled by a post-purchase journey", async () => {
    const { service, create } = makeSweep({ asked: ["ordguest001"], journey: ["ordcust0002"] });
    expect(await service.sweep(NOW)).toEqual({ queued: 0 });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("reviewRequestContact", () => {
  it("prefers the account's details, then the order's own contact", () => {
    const order = { id: "o", customerId: "c", billingContact: { phone: "0170", email: "b@x.test" }, customer: { name: null, phone: null, email: "a@x.test", locale: "bn" } };
    expect(reviewRequestContact(order, "sms")).toBe("0170");
    expect(reviewRequestContact(order, "email")).toBe("a@x.test");
    expect(reviewRequestContact({ ...order, billingContact: null, customer: null }, "whatsapp")).toBeNull();
  });
});

describe("StoreReviewsService link flow", () => {
  function makeStore(item: unknown) {
    const prisma = {
      orderItem: { findUnique: vi.fn().mockResolvedValue(item) },
      productVariant: { findUniqueOrThrow: vi.fn().mockResolvedValue({ productId: "p1" }) },
      review: { create: vi.fn((args: { data: unknown }) => Promise.resolve({ id: "r1", ...(args.data as object) })) },
    };
    const config = { get: () => KEY };
    const service = new StoreReviewsService(prisma as never, settings({ "reviews.autoApprove": false }) as never, { recomputeProductRating: vi.fn() } as never, {} as never, config as never);
    return { service, prisma };
  }
  const dto = { orderItemId: "item1", rating: 5, body: "Great", mediaUrls: [] };

  it("creates a verified review for a guest order item on the link's order", async () => {
    const { service } = makeStore({ id: "item1", orderId: "ordguest001", variantId: "v1", order: { customerId: null, status: "delivered" }, reviews: [] });
    const review = await service.submitByToken(signReviewToken("ordguest001", KEY), dto);
    expect(review).toMatchObject({ orderItemId: "item1", customerId: null, status: "pending" });
  });

  it("rejects an item from another order, an undelivered order and a bad link", async () => {
    const other = makeStore({ id: "item1", orderId: "ordother0001", variantId: "v1", order: { customerId: null, status: "delivered" }, reviews: [] });
    await expect(other.service.submitByToken(signReviewToken("ordguest001", KEY), dto)).rejects.toMatchObject({ response: { code: "NOT_PURCHASED" } });
    const undelivered = makeStore({ id: "item1", orderId: "ordguest001", variantId: "v1", order: { customerId: null, status: "shipped" }, reviews: [] });
    await expect(undelivered.service.submitByToken(signReviewToken("ordguest001", KEY), dto)).rejects.toMatchObject({ response: { code: "NOT_DELIVERED" } });
    await expect(undelivered.service.submitByToken("ordguest001-forgedsignaturexxxxxxx", dto)).rejects.toMatchObject({ response: { code: "REVIEW_LINK_INVALID" } });
  });
});
