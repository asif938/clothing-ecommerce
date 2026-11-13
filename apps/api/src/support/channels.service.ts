import { BadRequestException, Injectable } from "@nestjs/common";
import type { ConversationChannel, ProviderInstance } from "@clothing/db";
import {
  createInstagramDriver,
  createMessengerDriver,
  createMockChatDriver,
  createMockWhatsappDriver,
  createWhatsappCloudDriver,
  metaChatConfigSchema,
  mockChatConfigSchema,
  mockWhatsappConfigSchema,
  verifyMetaSignature,
  whatsappCloudConfigSchema,
  type InboxEvent,
} from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { ProviderRegistryService } from "../providers/provider-registry.service";

export interface InboxChannelAdapter {
  instance: ProviderInstance;
  channel: Exclude<ConversationChannel, "live_chat">;
  send(contactId: string, text: string): Promise<{ externalMessageId: string | null }>;
  parse(payload: unknown): InboxEvent[];
  /** null = this driver needs no signature (mock). */
  appSecret: string | null;
  verifyToken: string | null;
  isMock: boolean;
}

/**
 * Inbox channels as provider instances (golden rule 2): WhatsApp is the
 * existing `whatsapp` capability (the same Cloud API number notifications
 * use), Messenger/Instagram are the new `chat_channel` capability. Every
 * channel has a mock that accepts a simple `{ contactId, text }` webhook.
 */
@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistryService,
  ) {}

  adapterFor(instance: ProviderInstance): InboxChannelAdapter {
    const raw = this.registry.decryptConfig(instance.config);
    if (instance.capability === "whatsapp") {
      if (instance.driver === "whatsapp_cloud") {
        const config = whatsappCloudConfigSchema.parse(raw);
        const driver = createWhatsappCloudDriver(config);
        return {
          instance,
          channel: "whatsapp",
          send: (to, text) => driver.sendSession!(to, text),
          parse: (payload) => driver.parseWebhook!(payload),
          appSecret: config.appSecret ?? null,
          verifyToken: config.verifyToken ?? null,
          isMock: false,
        };
      }
      const driver = createMockWhatsappDriver(mockWhatsappConfigSchema.parse(raw));
      return { instance, channel: "whatsapp", send: (to, text) => driver.sendSession!(to, text), parse: (p) => driver.parseWebhook!(p), appSecret: null, verifyToken: null, isMock: true };
    }
    if (instance.capability === "chat_channel") {
      if (instance.driver === "messenger" || instance.driver === "instagram") {
        const config = metaChatConfigSchema.parse(raw);
        const driver = instance.driver === "messenger" ? createMessengerDriver(config) : createInstagramDriver(config);
        return { instance, channel: driver.channel, send: (to, text) => driver.sendText(to, text), parse: (p) => driver.parseWebhook(p), appSecret: config.appSecret, verifyToken: config.verifyToken, isMock: false };
      }
      const driver = createMockChatDriver(mockChatConfigSchema.parse(raw));
      return { instance, channel: driver.channel, send: (to, text) => driver.sendText(to, text), parse: (p) => driver.parseWebhook(p), appSecret: null, verifyToken: null, isMock: true };
    }
    throw new BadRequestException({ code: "NOT_AN_INBOX_CHANNEL", message: "This provider isn't an inbox channel." });
  }

  async instanceById(id: string): Promise<ProviderInstance | null> {
    const instance = await this.prisma.providerInstance.findUnique({ where: { id } });
    return instance && (instance.capability === "whatsapp" || instance.capability === "chat_channel") ? instance : null;
  }

  /**
   * Real Meta drivers must present a valid `X-Hub-Signature-256`; an instance
   * without an app secret configured can't receive at all (refused, never
   * trusted). Mocks are unsigned by design.
   */
  verifySignature(adapter: InboxChannelAdapter, rawBody: Buffer | undefined, signature: string | undefined): boolean {
    if (adapter.isMock) return true;
    if (!adapter.appSecret || !rawBody) return false;
    return verifyMetaSignature(rawBody, signature, adapter.appSecret);
  }

  /** The instance a conversation replies through: its own, or the active one for its channel. */
  async adapterForConversation(conversation: { channel: ConversationChannel; providerInstanceId: string | null }): Promise<InboxChannelAdapter> {
    if (conversation.channel === "live_chat") throw new BadRequestException({ code: "LIVE_CHAT", message: "Live chat has no provider." });
    let instance = conversation.providerInstanceId ? await this.prisma.providerInstance.findUnique({ where: { id: conversation.providerInstanceId } }) : null;
    if (!instance || !instance.enabled) {
      const candidates = await this.prisma.providerInstance.findMany({
        where: { capability: conversation.channel === "whatsapp" ? "whatsapp" : "chat_channel", enabled: true },
        orderBy: [{ isDefault: "desc" }, { priority: "desc" }],
      });
      instance = candidates.find((c) => this.adapterFor(c).channel === conversation.channel) ?? null;
    }
    if (!instance) throw new BadRequestException({ code: "CHANNEL_NOT_CONFIGURED", message: `No enabled ${conversation.channel} provider — add one under Integrations.` });
    return this.adapterFor(instance);
  }
}
