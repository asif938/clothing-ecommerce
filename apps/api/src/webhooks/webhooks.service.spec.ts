import { afterEach, describe, expect, it, vi } from "vitest";
import { encrypt } from "@clothing/shared/crypto";
import { WebhooksService } from "./webhooks.service";
import { verifySignature } from "./signature";

const actor = { id: "staff-1", name: "A", email: "a@x", locale: "en", permissions: new Set<string>(), isSuperAdmin: false, totpEnabled: true };
const KEY = "test-encryption-key-for-webhooks-0123456789";
const SECRET = "whsec_unit_test";

interface Delivery {
  id: string;
  webhookId: string;
  eventId: string;
  event: string;
  payload: unknown;
  status: string;
  attempts: number;
}

function make(opts: { enabled?: boolean; hooks?: { id: string }[]; delivery?: Partial<Delivery>; hook?: Record<string, unknown>; maxAttempts?: number; autoDisable?: number } = {}) {
  const hook = { id: "h1", name: "ERP", url: "https://8.8.8.8/hook", events: ["order.placed"], isActive: true, consecutiveFailures: 0, secret: encrypt(SECRET, KEY), ...opts.hook };
  const delivery: Delivery = { id: "d1", webhookId: "h1", eventId: "evt_1", event: "order.placed", payload: { id: "evt_1", event: "order.placed", data: { order: { orderNumber: "A-1" } } }, status: "pending", attempts: 0, ...opts.delivery };
  const prisma = {
    outboundWebhook: {
      findMany: vi.fn(() => Promise.resolve(opts.hooks ?? [{ id: "h1" }])),
      findUnique: vi.fn(() => Promise.resolve(hook)),
      create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: "h1", ...args.data })),
      update: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ ...hook, ...args.data })),
      delete: vi.fn(() => Promise.resolve({})),
    },
    webhookDelivery: {
      createMany: vi.fn(() => Promise.resolve({ count: 1 })),
      create: vi.fn(() => Promise.resolve(delivery)),
      findMany: vi.fn(() => Promise.resolve([{ ...delivery, webhook: hook }])),
      findUnique: vi.fn(() => Promise.resolve(delivery)),
      findUniqueOrThrow: vi.fn(() => Promise.resolve(delivery)),
      update: vi.fn(() => Promise.resolve({})),
      deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
    },
    order: { findUnique: vi.fn(() => Promise.resolve({ id: "o1", orderNumber: "A-1", items: [] })) },
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const settingValues: Record<string, unknown> = { "webhooks.enabled": opts.enabled ?? true, "webhooks.maxAttempts": opts.maxAttempts ?? 3, "webhooks.autoDisableAfterFailures": opts.autoDisable ?? 2 };
  const settings = { getValue: vi.fn((key: string) => Promise.resolve(settingValues[key])) };
  const config = { get: vi.fn(() => KEY) };
  return { service: new WebhooksService(prisma as never, audit as never, settings as never, config as never), prisma, audit, hook };
}

afterEach(() => vi.unstubAllGlobals());

describe("WebhooksService endpoints", () => {
  it("creates an endpoint, returns the secret once and stores it encrypted", async () => {
    const { service, prisma } = make();
    const result = await service.create({ name: "ERP", url: "https://8.8.8.8/hook", events: ["order.placed", "order.placed"] }, actor);
    expect(result.secret).toMatch(/^whsec_/);
    const stored = (prisma.outboundWebhook.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(JSON.stringify(stored)).not.toContain(result.secret);
    expect(stored.events).toEqual(["order.placed"]);
  });

  it("refuses non-https, private and unknown-event endpoints", async () => {
    const { service } = make();
    await expect(service.create({ name: "x", url: "http://8.8.8.8/hook", events: ["order.placed"] }, actor)).rejects.toMatchObject({ response: { code: "URL_NOT_ALLOWED" } });
    await expect(service.create({ name: "x", url: "https://10.0.0.5/hook", events: ["order.placed"] }, actor)).rejects.toMatchObject({ response: { code: "URL_NOT_ALLOWED" } });
    await expect(service.create({ name: "x", url: "https://8.8.8.8/hook", events: ["order.exploded"] }, actor)).rejects.toMatchObject({ response: { code: "EVENT_UNKNOWN" } });
  });

  it("starts a re-enabled endpoint with a clean failure count", async () => {
    const { service, prisma } = make({ hook: { isActive: false, consecutiveFailures: 20, disabledReason: "auto" } });
    await service.update("h1", { isActive: true }, actor);
    expect(prisma.outboundWebhook.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isActive: true, consecutiveFailures: 0, disabledReason: null }) }));
  });
});

describe("WebhooksService.enqueueEvent", () => {
  it("queues one pending delivery per subscribed active endpoint, sharing an event id", async () => {
    const { service, prisma } = make({ hooks: [{ id: "h1" }, { id: "h2" }] });
    expect(await service.enqueueEvent("order.placed", { order: { orderNumber: "A-1" } })).toBe(2);
    const rows = (prisma.webhookDelivery.createMany.mock.calls[0] as unknown as [{ data: { webhookId: string; eventId: string; status: string }[] }])[0].data;
    expect(rows.map((r) => r.webhookId)).toEqual(["h1", "h2"]);
    expect(new Set(rows.map((r) => r.eventId)).size).toBe(1);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
    expect(prisma.outboundWebhook.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, events: { has: "order.placed" } } }));
  });

  it("does nothing while webhooks are switched off or nobody subscribes", async () => {
    const off = make({ enabled: false });
    expect(await off.service.enqueueEvent("order.placed", {})).toBe(0);
    expect(off.prisma.outboundWebhook.findMany).not.toHaveBeenCalled();
    const none = make({ hooks: [] });
    expect(await none.service.enqueueEvent("order.placed", {})).toBe(0);
    expect(none.prisma.webhookDelivery.createMany).not.toHaveBeenCalled();
  });

  it("loads the order for an order event, without risk or device fields", async () => {
    const { service, prisma } = make();
    await service.dispatchOrderEvent("order.shipped", "o1");
    const select = (prisma.order.findUnique.mock.calls[0] as unknown as [{ select: Record<string, unknown> }])[0].select;
    expect(select).toHaveProperty("orderNumber");
    for (const forbidden of ["riskScore", "riskReasonCodes", "ip", "userAgent", "deviceId", "customerNote", "confirmationToken"]) expect(select).not.toHaveProperty(forbidden);
  });
});

describe("WebhooksService.deliverDue", () => {
  it("posts the signed body and marks the delivery succeeded", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { service, prisma } = make();
    await service.deliverDue();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string; redirect: string }];
    expect(url).toBe("https://8.8.8.8/hook");
    expect(init.redirect).toBe("error");
    expect(init.headers["x-webhook-id"]).toBe("evt_1");
    expect(init.headers["x-webhook-event"]).toBe("order.placed");
    expect(verifySignature(SECRET, init.headers["x-webhook-signature"]!, init.body, Math.floor(Date.now() / 1000))).toBe(true);
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: expect.objectContaining({ status: "succeeded", attempts: 1, responseStatus: 200, lastError: null, nextAttemptAt: null }) });
    expect(prisma.outboundWebhook.update).toHaveBeenCalledWith({ where: { id: "h1" }, data: expect.objectContaining({ consecutiveFailures: 0 }) });
  });

  it("schedules a retry after a failure, with the receiver's status recorded", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ status: 503 })));
    const { service, prisma } = make();
    await service.deliverDue();
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: expect.objectContaining({ status: "pending", attempts: 1, responseStatus: 503, lastError: "Receiver answered HTTP 503", nextAttemptAt: expect.any(Date) }) });
  });

  it("gives up after the maximum attempts", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("connect ECONNREFUSED"))));
    const { service, prisma } = make({ delivery: { attempts: 2 }, maxAttempts: 3 });
    await service.deliverDue();
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: expect.objectContaining({ status: "failed", attempts: 3, nextAttemptAt: null, lastError: "connect ECONNREFUSED" }) });
  });

  it("switches an endpoint off after too many failures in a row", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ status: 500 })));
    const { service, prisma } = make({ hook: { consecutiveFailures: 1 }, autoDisable: 2 });
    await service.deliverDue();
    expect(prisma.outboundWebhook.update).toHaveBeenCalledWith({ where: { id: "h1" }, data: expect.objectContaining({ consecutiveFailures: 2, isActive: false, disabledReason: expect.stringContaining("2") }) });
  });

  it("refuses to call a private address even if the stored URL somehow points at one", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { service, prisma } = make({ hook: { url: "https://169.254.169.254/latest" } });
    await service.deliverDue();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: expect.objectContaining({ lastError: expect.stringContaining("private") }) });
  });

  it("does not send to an endpoint that was switched off while the delivery was queued", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { service, prisma } = make({ hook: { isActive: false } });
    await service.deliverDue();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: expect.objectContaining({ status: "failed" }) });
  });
});

describe("WebhooksService.retry", () => {
  it("re-queues a failed delivery but not a successful one", async () => {
    const failed = make({ delivery: { status: "failed", attempts: 6 } });
    await failed.service.retry("d1", actor);
    expect(failed.prisma.webhookDelivery.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: expect.objectContaining({ status: "pending", attempts: 0 }) });
    const ok = make({ delivery: { status: "succeeded" } });
    await expect(ok.service.retry("d1", actor)).rejects.toMatchObject({ response: { code: "ALREADY_DELIVERED" } });
  });
});
