import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { ChannelsService } from "./channels.service";
import { InboxService } from "./inbox.service";

const MAX_ATTEMPTS = 5;

/**
 * Inbound channel webhooks (docs/PROJECT_SPEC.md §4.3 rule 5): verified
 * against the Meta app secret, stored raw in `webhook_events`, then
 * processed. Processing errors are recorded and retried by a sweep, and the
 * provider still gets a 200 — Meta disables webhooks that keep failing,
 * and the event is safe in our table. Duplicates are harmless: messages are
 * unique per provider message id.
 */
@Injectable()
export class InboxWebhooksService {
  private readonly logger = new Logger(InboxWebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly inbox: InboxService,
  ) {}

  /** Meta's subscription check: echo `hub.challenge` when the verify token matches. */
  async verifySubscription(instanceId: string, mode: string | undefined, token: string | undefined, challenge: string | undefined): Promise<string> {
    const instance = await this.channels.instanceById(instanceId);
    if (!instance) throw new NotFoundException("Unknown inbox channel");
    const adapter = this.channels.adapterFor(instance);
    if (mode !== "subscribe" || !adapter.verifyToken || token !== adapter.verifyToken || !challenge) {
      throw new ForbiddenException({ code: "VERIFY_TOKEN_MISMATCH", message: "Verify token doesn't match this channel." });
    }
    return challenge;
  }

  async receive(instanceId: string, payload: unknown, rawBody: Buffer | undefined, signature: string | undefined): Promise<{ ok: boolean; stored: number }> {
    const instance = await this.channels.instanceById(instanceId);
    if (!instance) throw new NotFoundException("Unknown inbox channel");
    const adapter = this.channels.adapterFor(instance);
    if (!this.channels.verifySignature(adapter, rawBody, signature)) {
      await this.prisma.webhookEvent.create({ data: { capability: instance.capability, driver: instance.driver, providerInstanceId: instance.id, payload: (payload ?? {}) as Prisma.InputJsonValue, status: "rejected", error: "Bad or missing signature" } });
      throw new ForbiddenException({ code: "INVALID_SIGNATURE", message: "Webhook signature check failed." });
    }
    if (!instance.enabled) return { ok: true, stored: 0 };
    const event = await this.prisma.webhookEvent.create({ data: { capability: instance.capability, driver: instance.driver, providerInstanceId: instance.id, payload: (payload ?? {}) as Prisma.InputJsonValue } });
    const stored = await this.process(event.id);
    return { ok: true, stored };
  }

  async process(eventId: string): Promise<number> {
    const event = await this.prisma.webhookEvent.findUnique({ where: { id: eventId } });
    if (!event || event.status === "processed" || !event.providerInstanceId) return 0;
    const instance = await this.channels.instanceById(event.providerInstanceId);
    if (!instance) return 0;
    try {
      const adapter = this.channels.adapterFor(instance);
      const stored = await this.inbox.ingest(instance, adapter.channel, adapter.parse(event.payload));
      await this.prisma.webhookEvent.update({ where: { id: eventId }, data: { status: "processed", processedAt: new Date(), attempts: { increment: 1 }, error: null } });
      return stored;
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Processing failed").slice(0, 1000);
      await this.prisma.webhookEvent.update({ where: { id: eventId }, data: { status: "failed", attempts: { increment: 1 }, error: message } });
      this.logger.warn(`Inbox webhook ${eventId} failed: ${message}`);
      return 0;
    }
  }

  async retrySweep(): Promise<number> {
    const failed = await this.prisma.webhookEvent.findMany({ where: { status: "failed", attempts: { lt: MAX_ATTEMPTS }, capability: { in: ["whatsapp", "chat_channel"] } }, orderBy: { receivedAt: "asc" }, take: 20, select: { id: true } });
    for (const row of failed) await this.process(row.id);
    return failed.length;
  }
}
