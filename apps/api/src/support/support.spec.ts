import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CacheService } from "../cache/cache.service";
import { InboxService } from "./inbox.service";
import { AssistantService } from "./assistant.service";
import { AssistantToolsService } from "./assistant-tools.service";
import { TicketsService } from "./tickets.service";
import { TelephonyService } from "./telephony.service";
import { InboxWebhooksService } from "./inbox-webhooks.service";
import { ChannelsService } from "./channels.service";

const staff = { id: "staff_1", name: "Agent", permissions: new Set(["support.inbox"]) } as never;

function settingsWith(values: Record<string, unknown>) {
  return { getValue: vi.fn((key: string) => Promise.resolve(values[key])) };
}

function uniqueViolation() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

const BASE_SETTINGS = {
  "support.assistant.enabled": true,
  "support.assistant.channels": ["live_chat", "whatsapp"],
  "support.liveChat.enabled": true,
  "support.liveChat.messagesPerMinute": 2,
  "support.liveChat.greeting": { bn: "স্বাগতম", en: "Welcome" },
  "support.assistant.handoffMessage": { bn: "একজন প্রতিনিধি আসছেন", en: "A person will reply soon" },
  "support.hours": { en: "10–10" },
  "brand.phone": "+8801700000000",
};

function makeInbox(options: { existing?: Record<string, unknown> | null; settings?: Record<string, unknown>; duplicate?: boolean } = {}) {
  let conversation: Record<string, unknown> | null = options.existing ?? null;
  const prisma = {
    conversation: {
      findUnique: vi.fn(() => Promise.resolve(conversation)),
      findUniqueOrThrow: vi.fn(() => Promise.resolve(conversation)),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        conversation = { id: "conv_1", status: "open", unreadCount: 0, orderIds: [], assignedTo: null, lastInboundAt: null, ...data };
        return Promise.resolve(conversation);
      }),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        conversation = { ...conversation, ...data };
        return Promise.resolve(conversation);
      }),
    },
    conversationMessage: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => (options.duplicate ? Promise.reject(uniqueViolation()) : Promise.resolve({ id: "msg_1", ...data }))),
      update: vi.fn(() => Promise.resolve({})),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
    },
    customer: { findUnique: vi.fn(() => Promise.resolve({ id: "cust_1" })) },
  };
  const notifications = { notifyStaffWithPermission: vi.fn(() => Promise.resolve()), notifyStaff: vi.fn(() => Promise.resolve()) };
  const adapter = { send: vi.fn(() => Promise.resolve({ externalMessageId: "wamid.out" })) };
  const channels = { adapterForConversation: vi.fn(() => Promise.resolve(adapter)) };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const inbox = new InboxService(prisma as never, settingsWith({ ...BASE_SETTINGS, ...options.settings }) as never, audit as never, new CacheService(), notifications as never, {} as never, channels as never);
  const trigger = vi.fn();
  inbox.registerBotTrigger(trigger);
  return { inbox, prisma, notifications, adapter, trigger, audit, current: () => conversation };
}

const inbound = (text: string, extra: Record<string, unknown> = {}) => ({
  kind: "message" as const,
  contactId: "8801712345678",
  externalMessageId: `wamid.${text}`,
  contactName: "Rina",
  phone: "+8801712345678",
  text,
  attachments: [],
  timestamp: new Date("2026-11-13T05:00:00Z"),
  ...extra,
});

describe("InboxService.ingest", () => {
  it("creates the conversation, links the customer by phone and hands it to the assistant", async () => {
    const { inbox, prisma, trigger, current } = makeInbox();
    expect(await inbox.ingest({ id: "inst_wa" } as never, "whatsapp", [inbound("XL ache?")])).toBe(1);
    expect(prisma.customer.findUnique).toHaveBeenCalledWith({ where: { phone: "+8801712345678" }, select: { id: true } });
    expect(current()).toMatchObject({ channel: "whatsapp", customerId: "cust_1", botActive: true, unreadCount: { increment: 1 }, lastMessagePreview: "XL ache?" });
    expect(trigger).toHaveBeenCalledWith("conv_1");
  });

  it("ignores a webhook retry of a message it already has", async () => {
    const { inbox, trigger } = makeInbox({ existing: { id: "conv_1", channel: "whatsapp", status: "open", botActive: true }, duplicate: true });
    expect(await inbox.ingest(null, "whatsapp", [inbound("again")])).toBe(0);
    expect(trigger).not.toHaveBeenCalled();
  });

  it("sends a customer who asks for a person straight to an agent, bot off", async () => {
    const { inbox, trigger, notifications, current } = makeInbox({ existing: { id: "conv_1", channel: "whatsapp", status: "open", botActive: true, contactName: "Rina" } });
    await inbox.ingest(null, "whatsapp", [inbound("I want to talk to a human")]);
    expect(current()).toMatchObject({ status: "waiting_agent", botActive: false });
    expect(trigger).not.toHaveBeenCalled();
    expect(notifications.notifyStaffWithPermission).toHaveBeenCalledWith(expect.objectContaining({ type: "support_handoff", permission: "support.inbox" }));
  });

  it("alerts staff about a new conversation the assistant isn't handling", async () => {
    const { inbox, trigger, notifications } = makeInbox({ settings: { "support.assistant.enabled": false } });
    await inbox.ingest(null, "messenger", [inbound("hello", { phone: null })]);
    expect(trigger).not.toHaveBeenCalled();
    expect(notifications.notifyStaffWithPermission).toHaveBeenCalledWith(expect.objectContaining({ type: "support_conversation" }));
  });

  it("applies delivery statuses to our outbound messages", async () => {
    const { inbox, prisma } = makeInbox();
    await inbox.ingest(null, "whatsapp", [{ kind: "status", externalMessageId: "wamid.out", status: "read" }]);
    expect(prisma.conversationMessage.updateMany).toHaveBeenCalledWith({ where: { externalId: "wamid.out", direction: "outbound" }, data: { deliveryStatus: "read" } });
  });
});

describe("InboxService replies", () => {
  it("refuses a WhatsApp reply outside the 24-hour window", async () => {
    const { inbox } = makeInbox({ existing: { id: "conv_1", channel: "whatsapp", contactId: "880", status: "open", lastInboundAt: new Date(Date.now() - 30 * 3_600_000), orderIds: [] } });
    await expect(inbox.reply("conv_1", "hi", staff)).rejects.toMatchObject({ response: { code: "REPLY_WINDOW_CLOSED" } });
  });

  it("a staff reply goes out through the channel, switches the bot off and claims the thread", async () => {
    const { inbox, adapter, current, audit } = makeInbox({ existing: { id: "conv_1", channel: "whatsapp", contactId: "8801712345678", status: "open", botActive: true, assignedTo: null, lastInboundAt: new Date(), orderIds: [] } });
    const result = await inbox.reply("conv_1", "Yes, XL is in stock", staff);
    expect(adapter.send).toHaveBeenCalledWith("8801712345678", "Yes, XL is in stock");
    expect(result.deliveryStatus).toBe("sent");
    expect(current()).toMatchObject({ botActive: false, status: "pending", assignedTo: "staff_1" });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "conversation.reply" }));
  });

  it("rate-limits live chat per visitor", async () => {
    const { inbox } = makeInbox();
    await inbox.liveChatSend("visitor_1", null, { text: "one" });
    await inbox.liveChatSend("visitor_1", null, { text: "two" });
    await expect(inbox.liveChatSend("visitor_1", null, { text: "three" })).rejects.toMatchObject({ status: 429 });
  });

  it("refuses live chat while it is switched off", async () => {
    const { inbox } = makeInbox({ settings: { "support.liveChat.enabled": false } });
    await expect(inbox.liveChatSend("v", null, { text: "hi" })).rejects.toMatchObject({ response: { code: "LIVE_CHAT_DISABLED" } });
  });
});

function makeAssistant(turns: (() => Promise<unknown>)[], conversationOverrides: Record<string, unknown> = {}) {
  const conversation = { id: "conv_1", channel: "live_chat", botActive: true, contactPhone: "+8801712345678", customerId: null, ...conversationOverrides };
  const prisma = {
    conversation: {
      findUnique: vi.fn(() => Promise.resolve(conversation)),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...conversation, ...data })),
      findMany: vi.fn(() => Promise.resolve([])),
    },
    conversationMessage: { findMany: vi.fn(() => Promise.resolve([{ authorType: "customer", body: "Where is ABC2611130001?", attachments: null, createdAt: new Date() }])) },
    customer: { findUnique: vi.fn() },
  };
  let call = 0;
  const ai = { chat: vi.fn(() => turns[call++]!()) };
  const inbox = { registerBotTrigger: vi.fn(), sendOutbound: vi.fn(() => Promise.resolve({ id: "m", deliveryStatus: "sent", error: null })), notifyHandoff: vi.fn(() => Promise.resolve()) };
  const tools = { run: vi.fn(() => Promise.resolve({ content: '{"found":true,"status":"shipped"}', isError: false })) };
  const service = new AssistantService(prisma as never, settingsWith(BASE_SETTINGS) as never, ai as never, inbox as never, tools as never);
  return { service, ai, inbox, tools, prisma };
}

const turn = (text: string, toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = []) => () =>
  Promise.resolve({ text, toolCalls, stopReason: toolCalls.length ? "tool_use" : "end", model: "m", inputTokens: 1, outputTokens: 1, usageLogId: "u" });

describe("AssistantService", () => {
  it("runs tools with the chat's trusted phone, then replies", async () => {
    const { service, tools, inbox, ai } = makeAssistant([turn("", [{ id: "t1", name: "order_status", input: { order_number: "ABC2611130001" } }]), turn("Your order has shipped.")]);
    expect(await service.respond("conv_1")).toEqual({ outcome: "replied", reply: "Your order has shipped." });
    expect(tools.run).toHaveBeenCalledWith("order_status", { order_number: "ABC2611130001" }, { trustedPhone: "+8801712345678", customerId: null });
    const secondCall = (ai.chat.mock.calls as unknown as [{ messages: { role: string }[] }][])[1]![0];
    expect(secondCall.messages.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
    expect(inbox.sendOutbound).toHaveBeenCalledWith(expect.anything(), "Your order has shipped.", expect.objectContaining({ type: "bot" }));
  });

  it("hands over when the model calls handoff_to_human", async () => {
    const { service, inbox, prisma } = makeAssistant([turn("Let me get a colleague.", [{ id: "t1", name: "handoff_to_human", input: { reason: "Refund request" } }])]);
    expect(await service.respond("conv_1")).toEqual({ outcome: "handoff", reason: "Refund request" });
    expect(prisma.conversation.update).toHaveBeenLastCalledWith({ where: { id: "conv_1" }, data: expect.objectContaining({ status: "waiting_agent", botActive: false, handoffReason: "Refund request" }) });
    expect(inbox.sendOutbound).toHaveBeenCalledWith(expect.anything(), "Let me get a colleague.", expect.anything());
    expect(inbox.notifyHandoff).toHaveBeenCalled();
  });

  it("hands over with the configured message when AI is unavailable", async () => {
    const { service, inbox } = makeAssistant([() => Promise.reject(new Error("budget used up"))]);
    const result = await service.respond("conv_1");
    expect(result.outcome).toBe("handoff");
    expect(inbox.sendOutbound).toHaveBeenCalledWith(expect.anything(), "A person will reply soon", expect.anything());
  });

  it("does nothing once a person has taken over", async () => {
    const { service, ai } = makeAssistant([turn("hi")], { botActive: false });
    expect((await service.respond("conv_1")).outcome).toBe("skipped");
    expect(ai.chat).not.toHaveBeenCalled();
  });

  it("only offers the handoff tool on the last round", async () => {
    const loop = () => turn("", [{ id: "t", name: "search_products", input: { query: "x" } }])();
    const { service, ai } = makeAssistant([loop, loop, loop, loop, turn("Here you go.")]);
    expect((await service.respond("conv_1")).outcome).toBe("replied");
    const last = (ai.chat.mock.calls as unknown as [{ tools: { name: string }[] }][])[4]![0];
    expect(last.tools.map((t) => t.name)).toEqual(["handoff_to_human"]);
  });
});

describe("AssistantToolsService.order_status", () => {
  function makeTools(order: Record<string, unknown> | null) {
    const prisma = { order: { findUnique: vi.fn(() => Promise.resolve(order)) } };
    return new AssistantToolsService(prisma as never, {} as never, {} as never, {} as never);
  }
  const order = {
    orderNumber: "ABC2611130001",
    createdAt: new Date("2026-11-13T00:00:00Z"),
    status: "confirmed",
    paymentStatus: "unpaid",
    fulfillmentStatus: "unfulfilled",
    total: 150_000,
    codAmount: 150_000,
    billingContact: { phone: "+8801712345678" },
    items: [{ title: { en: "Panjabi" }, quantity: 1 }],
    shipments: [],
  };

  it("answers only for the chat's own phone", async () => {
    const ok = await makeTools(order).run("order_status", { order_number: "abc2611130001" }, { trustedPhone: "+8801712345678", customerId: null });
    expect(JSON.parse(ok.content)).toMatchObject({ found: true, status: "confirmed", total: "৳1,500", items: ["1 × Panjabi"] });
    const other = await makeTools(order).run("order_status", { order_number: "ABC2611130001" }, { trustedPhone: "+8801899999999", customerId: null });
    expect(JSON.parse(other.content)).toMatchObject({ found: false });
  });

  it("asks for a phone when the chat has none, and rejects bad input and unknown tools", async () => {
    expect(JSON.parse((await makeTools(order).run("order_status", { order_number: "ABC2611130001" }, { trustedPhone: null, customerId: null })).content).note).toContain("phone");
    expect((await makeTools(order).run("order_status", { order_number: 5 }, { trustedPhone: null, customerId: null })).isError).toBe(true);
    expect((await makeTools(order).run("delete_everything", {}, { trustedPhone: null, customerId: null })).isError).toBe(true);
  });
});

function makeTickets() {
  const tickets: Record<string, Record<string, unknown>> = {};
  const prisma = {
    ticket: {
      findFirst: vi.fn(() => Promise.resolve(null)),
      findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(tickets[where.id] ?? null)),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        tickets.t1 = { id: "t1", status: "open", firstResponseAt: null, resolvedAt: null, firstResponseBreachedAt: null, resolutionBreachedAt: null, createdAt: new Date("2026-11-13T04:00:00Z"), assignedTo: null, ...data };
        return Promise.resolve(tickets.t1);
      }),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        tickets[where.id] = { ...tickets[where.id], ...data };
        return Promise.resolve(tickets[where.id]);
      }),
      findMany: vi.fn(() => Promise.resolve(Object.values(tickets))),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
    },
    ticketMessage: { create: vi.fn(({ data }: { data: object }) => Promise.resolve({ id: "tm", ...data })) },
  };
  const notifications = { notifyStaff: vi.fn(() => Promise.resolve()), notifyStaffWithPermission: vi.fn(() => Promise.resolve()) };
  const service = new TicketsService(
    prisma as never,
    settingsWith({ "support.sla.firstResponseMinutes": { low: 1440, normal: 480, high: 120, urgent: 30 }, "support.sla.resolutionMinutes": { low: 4320, normal: 1440, high: 480, urgent: 120 } }) as never,
    { record: vi.fn() } as never,
    notifications as never,
    {} as never,
  );
  return { service, prisma, notifications, tickets };
}

describe("TicketsService", () => {
  it("sets SLA deadlines from priority and moves them when priority changes", async () => {
    const { service, tickets } = makeTickets();
    const created = await service.create({ subject: "Wrong size", type: "order_issue", priority: "urgent" }, staff);
    expect(created.number).toMatch(/^TCK-\d{6}-0001$/);
    expect((created.resolutionDueAt as Date).getTime() - (created.firstResponseDueAt as Date).getTime()).toBe(90 * 60_000);
    tickets.t1!.createdAt = new Date("2026-11-13T04:00:00Z");
    const updated = await service.update("t1", { priority: "low" }, staff);
    expect((updated.firstResponseDueAt as Date).toISOString()).toBe("2026-11-14T04:00:00.000Z");
  });

  it("the first customer-facing reply meets the first-response SLA; notes don't", async () => {
    const { service, tickets, prisma } = makeTickets();
    await service.create({ subject: "x", type: "general", priority: "normal" }, staff);
    await service.addMessage("t1", { body: "internal", internal: true, sendToConversation: false }, staff);
    expect(tickets.t1!.firstResponseAt).toBeNull();
    await service.addMessage("t1", { body: "We're on it", internal: false, sendToConversation: false }, staff);
    expect(prisma.ticket.update).toHaveBeenLastCalledWith({ where: { id: "t1" }, data: expect.objectContaining({ status: "pending", firstResponseAt: expect.any(Date) }) });
  });

  it("marks breaches once and alerts the assignee", async () => {
    const { service, prisma, notifications, tickets } = makeTickets();
    await service.create({ subject: "late", type: "general", priority: "urgent", assignedTo: "staff_2" }, staff);
    tickets.t1!.assignedTo = "staff_2";
    prisma.ticket.findMany.mockResolvedValueOnce([tickets.t1] as never).mockResolvedValueOnce([] as never);
    await service.slaSweep(new Date("2026-11-20T00:00:00Z"));
    expect(notifications.notifyStaff).toHaveBeenCalledWith("staff_2", expect.objectContaining({ type: "support_sla" }));
    prisma.ticket.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    prisma.ticket.findMany.mockResolvedValueOnce([tickets.t1] as never).mockResolvedValueOnce([] as never);
    await service.slaSweep(new Date("2026-11-20T00:01:00Z"));
    expect(notifications.notifyStaff).toHaveBeenCalledTimes(1);
  });
});

describe("TelephonyService", () => {
  function makeTelephony(active: { instanceId: string; driver: string } | null, staffPhone: string | null) {
    const calls: Record<string, Record<string, unknown>> = {};
    const prisma = {
      providerInstance: { findUnique: vi.fn(() => Promise.resolve(active ? { id: active.instanceId, capability: "telephony", driver: active.driver, config: {} } : null)) },
      staffUser: { findUnique: vi.fn(() => Promise.resolve({ phone: staffPhone })) },
      callLog: {
        create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
          calls.c1 = { id: "c1", externalId: null, ...data };
          return Promise.resolve(calls.c1);
        }),
        update: vi.fn(({ data }: { data: Record<string, unknown> }) => {
          calls.c1 = { ...calls.c1, ...data };
          return Promise.resolve(calls.c1);
        }),
        findFirst: vi.fn(() => Promise.resolve(calls.c1 ?? null)),
      },
    };
    const registry = { findActiveInstance: vi.fn(() => Promise.resolve(active)), decryptConfig: vi.fn(() => ({})) };
    return { service: new TelephonyService(prisma as never, { record: vi.fn() } as never, registry as never), calls };
  }

  it("falls back to a logged tel: link without a provider", async () => {
    const { service } = makeTelephony(null, null);
    const result = await service.startCall({ phone: "01712345678" }, staff);
    expect(result).toMatchObject({ mode: "tel", telUrl: "tel:+8801712345678", call: { driver: "tel", phone: "+8801712345678" } });
  });

  it("needs the agent's own phone, then places the call and takes status webhooks", async () => {
    const noPhone = makeTelephony({ instanceId: "tel_1", driver: "mock" }, null);
    await expect(noPhone.service.startCall({ phone: "01712345678" }, staff)).rejects.toMatchObject({ response: { code: "AGENT_PHONE_REQUIRED" } });

    const { service, calls } = makeTelephony({ instanceId: "tel_1", driver: "mock" }, "+8801811111111");
    const result = await service.startCall({ phone: "01712345678", orderId: "o1" }, staff);
    expect(result.mode).toBe("provider");
    expect(calls.c1).toMatchObject({ externalId: "mock_call_c1", orderId: "o1" });
    await service.webhook("tel_1", { reference: "c1", status: "completed", duration: 95 }, undefined);
    expect(calls.c1).toMatchObject({ status: "completed", durationSeconds: 95, endedAt: expect.any(Date) });
  });

  it("rejects a bad number", async () => {
    const { service } = makeTelephony(null, null);
    await expect(service.startCall({ phone: "12345" }, staff)).rejects.toMatchObject({ response: { code: "INVALID_PHONE" } });
  });
});

describe("InboxWebhooksService", () => {
  function makeWebhooks(instance: Record<string, unknown>, config: Record<string, unknown>) {
    const prisma = {
      providerInstance: { findUnique: vi.fn(() => Promise.resolve(instance)) },
      webhookEvent: {
        create: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "ev1", ...data })),
        findUnique: vi.fn(() => Promise.resolve({ id: "ev1", status: "received", providerInstanceId: instance.id, payload: { contactId: "c1", text: "hello" } })),
        update: vi.fn(() => Promise.resolve({})),
      },
    };
    const channels = new ChannelsService(prisma as never, { decryptConfig: vi.fn(() => config) } as never);
    const inbox = { ingest: vi.fn(() => Promise.resolve(1)) };
    return { service: new InboxWebhooksService(prisma as never, channels, inbox as never), prisma, inbox };
  }
  const cloud = { id: "wa_1", capability: "whatsapp", driver: "whatsapp_cloud", enabled: true, config: {} };
  const cloudConfig = { accessToken: "t", phoneNumberId: "p", appSecret: "app-secret", verifyToken: "verify-me-123" };

  it("answers Meta's subscription check only with the right token", async () => {
    const { service } = makeWebhooks(cloud, cloudConfig);
    await expect(service.verifySubscription("wa_1", "subscribe", "verify-me-123", "42")).resolves.toBe("42");
    await expect(service.verifySubscription("wa_1", "subscribe", "wrong", "42")).rejects.toMatchObject({ status: 403 });
  });

  it("rejects unsigned real-channel webhooks and stores them as rejected", async () => {
    const { service, prisma } = makeWebhooks(cloud, cloudConfig);
    await expect(service.receive("wa_1", { object: "whatsapp_business_account" }, Buffer.from("{}"), undefined)).rejects.toMatchObject({ status: 403 });
    expect(prisma.webhookEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "rejected" }) });
  });

  it("accepts a correctly signed webhook and processes it", async () => {
    const { service, inbox } = makeWebhooks(cloud, cloudConfig);
    const raw = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
    const signature = `sha256=${createHmac("sha256", "app-secret").update(raw).digest("hex")}`;
    await expect(service.receive("wa_1", JSON.parse(raw.toString()), raw, signature)).resolves.toMatchObject({ ok: true });
    expect(inbox.ingest).toHaveBeenCalled();
  });

  it("accepts the mock unsigned, and records processing failures for retry", async () => {
    const mock = { id: "chat_1", capability: "chat_channel", driver: "mock", enabled: true, config: {} };
    const { service, inbox, prisma } = makeWebhooks(mock, {});
    await service.receive("chat_1", { contactId: "c1", text: "hello" }, undefined, undefined);
    expect(inbox.ingest).toHaveBeenCalledWith(mock, "messenger", [expect.objectContaining({ contactId: "c1", text: "hello" })]);
    inbox.ingest.mockRejectedValueOnce(new Error("db down"));
    await service.process("ev1");
    expect(prisma.webhookEvent.update).toHaveBeenLastCalledWith({ where: { id: "ev1" }, data: expect.objectContaining({ status: "failed", error: "db down" }) });
  });
});
