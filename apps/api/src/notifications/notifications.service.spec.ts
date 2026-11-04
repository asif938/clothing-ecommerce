import { describe, expect, it, vi } from "vitest";
import { NotificationsService } from "./notifications.service";

function makeDb(overrides: { channels?: string[] | null; templates?: Record<string, { isActive: boolean; bodyBn: string; bodyEn: string; subjectBn?: string | null; subjectEn?: string | null } | undefined> } = {}) {
  const templates = overrides.templates ?? {};
  return {
    notificationChannelRule: {
      findUnique: vi.fn(() => Promise.resolve(overrides.channels === undefined ? null : overrides.channels === null ? null : { channels: overrides.channels })),
    },
    messageTemplate: {
      findUnique: vi.fn(({ where }: { where: { event_channel: { event: string; channel: string } } }) => {
        const key = `${where.event_channel.event}:${where.event_channel.channel}`;
        return Promise.resolve(templates[key] ?? null);
      }),
    },
    notificationLog: { create: vi.fn(() => Promise.resolve({})) },
  };
}

function makeService(db: ReturnType<typeof makeDb>, settings: Record<string, unknown> = { "brand.name": { bn: "ডেমো", en: "Demo" }, "brand.phone": "01700-000000" }) {
  const settingsService = { getValue: vi.fn((key: string) => Promise.resolve(settings[key])) };
  const prisma = { ...db };
  const service = new NotificationsService(prisma as never, settingsService as never);
  return { service, prisma };
}

describe("NotificationsService.enqueue", () => {
  it("queues the first channel in order that has a reachable contact and an active template", async () => {
    const db = makeDb({
      channels: ["whatsapp", "sms"],
      templates: { "order_confirmed:sms": { isActive: true, bodyBn: "bn", bodyEn: "en" } },
    });
    const { service } = makeService(db);
    await service.enqueue(db as never, {
      event: "order_confirmed",
      recipientType: "customer",
      recipientId: "c1",
      locale: "bn",
      contacts: { sms: "+8801700000000", whatsapp: null, email: null },
      variables: {},
    });
    expect(db.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ channel: "sms", fallbackIndex: 1, to: "+8801700000000", status: "queued" }) }),
    );
  });

  it("skips a channel with no active template even if the contact is reachable", async () => {
    const db = makeDb({ channels: ["email", "sms"], templates: { "order_confirmed:sms": { isActive: true, bodyBn: "bn", bodyEn: "en" } } });
    const { service } = makeService(db);
    await service.enqueue(db as never, {
      event: "order_confirmed",
      recipientType: "customer",
      recipientId: "c1",
      locale: "bn",
      contacts: { sms: "+8801700000000", whatsapp: null, email: "a@b.com" },
      variables: {},
    });
    expect(db.notificationLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ channel: "sms" }) }));
  });

  it("logs nothing when no configured channel is reachable", async () => {
    const db = makeDb({ channels: ["email"], templates: {} });
    const { service } = makeService(db);
    await service.enqueue(db as never, {
      event: "order_confirmed",
      recipientType: "guest",
      locale: "bn",
      contacts: { sms: "+8801700000000", whatsapp: null, email: null },
      variables: {},
    });
    expect(db.notificationLog.create).not.toHaveBeenCalled();
  });

  it("falls back to the catalog's default channel order when no rule row exists", async () => {
    const db = makeDb({ channels: undefined, templates: { "otp_verification:sms": { isActive: true, bodyBn: "কোড {otp}", bodyEn: "Code {otp}" } } });
    const { service } = makeService(db);
    await service.enqueue(db as never, {
      event: "otp_verification",
      recipientType: "guest",
      locale: "bn",
      contacts: { sms: "+8801700000000", whatsapp: null, email: null },
      variables: { otp: "123456" },
    });
    expect(db.notificationLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ channel: "sms", body: "কোড 123456" }) }));
  });
});

describe("NotificationsService.createFallbackLog", () => {
  it("creates the next eligible channel's log and returns true", async () => {
    const db = makeDb({ channels: ["whatsapp", "sms"], templates: { "order_confirmed:sms": { isActive: true, bodyBn: "bn text", bodyEn: "en text" } } });
    const { service, prisma } = makeService(db);
    const created = await service.createFallbackLog({
      event: "order_confirmed",
      fallbackIndex: 0,
      recipientType: "customer",
      recipientId: "c1",
      locale: "bn",
      contacts: { sms: "+8801700000000", whatsapp: "+8801700000000", email: null },
      variables: {},
      relatedEntityType: "order",
      relatedEntityId: "o1",
    });
    expect(created).toBe(true);
    expect(prisma.notificationLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ channel: "sms", fallbackIndex: 1 }) }));
  });

  it("returns false when every later channel is unreachable or has no template", async () => {
    const db = makeDb({ channels: ["whatsapp", "sms"], templates: {} });
    const { service } = makeService(db);
    const created = await service.createFallbackLog({
      event: "order_confirmed",
      fallbackIndex: 0,
      recipientType: "customer",
      recipientId: "c1",
      locale: "bn",
      contacts: { sms: "+8801700000000", whatsapp: "+8801700000000", email: null },
      variables: {},
      relatedEntityType: "order",
      relatedEntityId: "o1",
    });
    expect(created).toBe(false);
  });
});
