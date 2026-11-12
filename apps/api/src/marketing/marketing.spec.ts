import { describe, expect, it, vi } from "vitest";
import { parseCount, parseSpendDate, spendToPoisha } from "./ad-spend";
import { contactFor, hasConsent, pickChannel, type MarketingRecipient } from "./marketing-messaging.service";
import { BroadcastsService } from "./broadcasts.service";
import { JourneysService } from "./journeys.service";

const recipient: MarketingRecipient = {
  id: "c1",
  name: "Rahim",
  phone: "+8801712345678",
  email: null,
  locale: "bn",
  pointsBalance: 0,
  marketingConsentSms: true,
  marketingConsentEmail: false,
  marketingConsentWhatsapp: false,
  hasPush: false,
};

describe("ad spend parsing", () => {
  it("reads ISO, d/m/y (default), m/d/y and Excel serial dates", () => {
    expect(parseSpendDate("2026-11-05")?.toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(parseSpendDate("05/11/2026")?.toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(parseSpendDate("11/25/2026")?.toISOString()).toBe("2026-11-25T00:00:00.000Z");
    expect(parseSpendDate("11/05/2026", "mdy")?.toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(parseSpendDate(46_000)?.toISOString()).toBe("2025-12-09T00:00:00.000Z");
    expect(parseSpendDate("31/02/2026")).toBeNull();
    expect(parseSpendDate("yesterday")).toBeNull();
  });

  it("converts spend to poisha without floats, with an optional exchange rate", () => {
    expect(spendToPoisha("1,250.50", null)).toBe(125_050);
    expect(spendToPoisha(99.99, null)).toBe(9_999);
    expect(spendToPoisha("$10.00", "122.50")).toBe(122_500);
    expect(spendToPoisha("0.33", "122.50")).toBe(4_043); // 33 × 12250 / 100 = 4042.5 → 4043
    expect(spendToPoisha("-5", null)).toBeNull();
    expect(spendToPoisha("abc", null)).toBeNull();
  });

  it("parses counts leniently", () => {
    expect(parseCount("12,345")).toBe(12_345);
    expect(parseCount(7.6)).toBe(8);
    expect(parseCount("")).toBe(0);
  });
});

describe("marketing channel choice", () => {
  it("needs both an address and (when required) consent", () => {
    expect(contactFor("sms", recipient)).toBe("+8801712345678");
    expect(contactFor("email", recipient)).toBeNull();
    expect(hasConsent("whatsapp", recipient)).toBe(false);
    expect(pickChannel(["whatsapp", "sms"], recipient, true)).toBe("sms");
    expect(pickChannel(["whatsapp", "sms"], recipient, false)).toBe("whatsapp");
    expect(pickChannel(["email", "push"], recipient, true)).toBeNull();
  });
});

describe("BroadcastsService", () => {
  function make(status = "draft") {
    const tx = { notificationLog: { updateMany: vi.fn(() => Promise.resolve({ count: 3 })) }, broadcast: { update: vi.fn((a: { data: object }) => Promise.resolve({ id: "b1", ...a.data })) } };
    const prisma = {
      broadcast: { findUnique: vi.fn(() => Promise.resolve({ id: "b1", status, channel: "sms", segmentId: null, bodyBn: "হ্যালো {customer_name}", bodyEn: "Hi {customer_name}" })), update: vi.fn((a: { data: object }) => Promise.resolve({ id: "b1", ...a.data })) },
      customer: { count: vi.fn((args: { where: { AND: unknown[] } }) => Promise.resolve(JSON.stringify(args.where).includes('"locale":"en"') ? 10 : 40)) },
      $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const settings = { getValue: vi.fn((key: string) => Promise.resolve(key === "marketing.broadcasts.enabled" ? true : key === "marketing.costs.smsPerSegment" ? 35 : 100)) };
    const audit = { record: vi.fn(() => Promise.resolve()) };
    const messaging = {
      baseVariables: vi.fn(() => Promise.resolve({ brand_name: "Demo" })),
      render: vi.fn((copy: { bodyBn: string; bodyEn: string }, locale: string) => ({ subject: null, body: locale === "en" ? copy.bodyEn : copy.bodyBn })),
    };
    const service = new BroadcastsService(prisma as never, settings as never, audit as never, {} as never, messaging as never);
    return { service, prisma, tx };
  }

  const actor = { id: "s1", name: "A", email: "a@x", locale: "en", permissions: new Set<string>(), isSuperAdmin: false, totpEnabled: true };

  it("estimates recipients by locale and SMS cost", async () => {
    const { service } = make();
    const estimate = await service.estimate({ channel: "sms", segmentId: null, bodyBn: "হ্যালো {customer_name}", bodyEn: "Hi {customer_name}" });
    expect(estimate.recipients).toBe(40);
    expect(estimate.totalCost).toBe(40 * 35); // 30 bn + 10 en, one segment each
  });

  it("schedules with the estimate captured, and refuses an empty audience", async () => {
    const { service, prisma } = make();
    const scheduled = await service.schedule("b1", { scheduledAt: null }, actor);
    expect(scheduled).toMatchObject({ status: "scheduled", recipientEstimate: 40, estimatedCost: 1400 });
    prisma.customer.count.mockResolvedValue(0);
    prisma.broadcast.findUnique.mockResolvedValue({ id: "b1", status: "draft", channel: "sms", segmentId: null, bodyBn: "x", bodyEn: "x" });
    await expect(service.schedule("b1", {}, actor)).rejects.toMatchObject({ response: { code: "NO_RECIPIENTS" } });
  });

  it("cancelling a sending broadcast withdraws queued messages", async () => {
    const { service, tx } = make("sending");
    const result = await service.cancel("b1", actor);
    expect(result).toMatchObject({ status: "cancelled" });
    expect(tx.notificationLog.updateMany).toHaveBeenCalledWith({ where: { relatedEntityType: "broadcast", relatedEntityId: "b1", status: { in: ["queued", "retrying"] } }, data: expect.objectContaining({ status: "failed" }) });
  });

  it("won't edit a scheduled broadcast", async () => {
    const { service } = make("scheduled");
    await expect(service.update("b1", { name: "x", channel: "sms", bodyBn: "a", bodyEn: "b" }, actor)).rejects.toMatchObject({ response: { code: "NOT_DRAFT" } });
  });
});

describe("JourneysService.runDue", () => {
  const journey = { id: "j1", type: "win_back", isActive: true, respectConsent: true, config: {}, steps: [{ delayHours: 0, channels: ["whatsapp", "sms"], bodyBn: "ফিরে আসুন", bodyEn: "Come back" }, { delayHours: 48, channels: ["sms"], bodyBn: "আবার", bodyEn: "Again" }] };
  const customer = { ...recipient, _count: { pushSubscriptions: 0 }, lastOrderAt: new Date("2026-08-01"), deletedAt: null, status: "active" };

  function make(enrollment: Record<string, unknown>) {
    const tx = { journeyEnrollment: { updateMany: vi.fn(() => Promise.resolve({ count: 1 })) } };
    const prisma = {
      journeyEnrollment: { findMany: vi.fn(() => Promise.resolve([enrollment])), update: vi.fn(() => Promise.resolve({})) },
      order: { findUnique: vi.fn() },
      $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const settings = { getValue: vi.fn(() => Promise.resolve(true)) };
    const messaging = { baseVariables: vi.fn(() => Promise.resolve({})), queue: vi.fn(() => Promise.resolve()), mintPersonalCode: vi.fn() };
    const service = new JourneysService(prisma as never, settings as never, {} as never, {} as never, messaging as never);
    return { service, prisma, tx, messaging };
  }

  it("sends the step on the first consented channel and schedules the next step", async () => {
    const now = new Date("2026-11-12T10:00:00Z");
    const { service, tx, messaging } = make({ id: "e1", stepIndex: 0, status: "active", createdAt: new Date("2026-11-10"), orderId: null, journey, customer });
    await expect(service.runDue(now)).resolves.toEqual({ sent: 1, skipped: 0 });
    expect(messaging.queue).toHaveBeenCalledWith(tx, expect.objectContaining({ event: "journey_message", channel: "sms", related: { type: "journey", id: "j1" } }));
    expect(tx.journeyEnrollment.updateMany).toHaveBeenCalledWith({ where: { id: "e1", stepIndex: 0, status: "active" }, data: { stepIndex: 1, nextRunAt: new Date("2026-11-14T10:00:00Z"), lastError: null } });
  });

  it("exits a win-back enrolment once the customer orders again", async () => {
    const { service, prisma, messaging } = make({ id: "e1", stepIndex: 0, status: "active", createdAt: new Date("2026-11-01"), orderId: null, journey, customer: { ...customer, lastOrderAt: new Date("2026-11-05") } });
    await expect(service.runDue(new Date("2026-11-12"))).resolves.toEqual({ sent: 0, skipped: 1 });
    expect(prisma.journeyEnrollment.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { status: "exited", lastError: "Customer ordered again", nextRunAt: null } });
    expect(messaging.queue).not.toHaveBeenCalled();
  });

  it("skips (but advances past) a step nobody can receive", async () => {
    const { service, prisma, messaging } = make({ id: "e1", stepIndex: 0, status: "active", createdAt: new Date("2026-11-10"), orderId: null, journey, customer: { ...customer, marketingConsentSms: false } });
    await service.runDue(new Date("2026-11-12T10:00:00Z"));
    expect(messaging.queue).not.toHaveBeenCalled();
    expect(prisma.journeyEnrollment.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: expect.objectContaining({ stepIndex: 1, lastError: "No reachable channel with consent" }) });
  });
});
