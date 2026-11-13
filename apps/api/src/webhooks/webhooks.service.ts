import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@clothing/db";
import { decrypt, encrypt, isEncryptedPayload } from "@clothing/shared/crypto";
import { WEBHOOK_EVENT_KEYS } from "@clothing/shared/analytics";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { assertPublicHttpsUrl } from "../automation/safe-fetch";
import type { Env } from "../config/env.schema";
import type { AuthenticatedStaff } from "../common/types";
import { afterAttempt, generateWebhookSecret, isSuccessStatus, shouldAutoDisable, signatureHeader } from "./signature";

const DELIVERY_BATCH = 25;
const REQUEST_TIMEOUT_MS = 8000;
/** Keep delivery history long enough to debug an integration, short enough not to bloat the database. */
const HISTORY_DAYS = 30;

export interface WebhookInput {
  name: string;
  url: string;
  events: string[];
  isActive?: boolean;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unknown error").slice(0, 500);

/**
 * Outbound webhooks (docs/PROJECT_SPEC.md §11.1, §16 M17). An event becomes
 * one `pending` delivery per subscribed endpoint; a recurring sweep sends
 * them signed, retries failures with doubling delays, gives up after
 * `webhooks.maxAttempts` and switches an endpoint off after
 * `webhooks.autoDisableAfterFailures` failures in a row. Delivery is
 * at-least-once — receivers should de-duplicate on the `X-Webhook-Id`.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private lastPruneAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  private get encryptionKey(): string {
    return this.config.get("APP_ENCRYPTION_KEY", { infer: true });
  }

  // ------------------------------------------------------------------ endpoints

  private validateEvents(events: string[]) {
    const unknown = events.filter((e) => !WEBHOOK_EVENT_KEYS.includes(e));
    if (unknown.length > 0) throw new BadRequestException({ code: "EVENT_UNKNOWN", message: `Unknown event: ${unknown.join(", ")}` });
  }

  private async validateUrl(url: string) {
    try {
      await assertPublicHttpsUrl(url);
    } catch (error) {
      throw new BadRequestException({ code: "URL_NOT_ALLOWED", message: errorMessage(error) });
    }
  }

  async list() {
    const hooks = await this.prisma.outboundWebhook.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, url: true, events: true, isActive: true, consecutiveFailures: true, disabledReason: true, lastDeliveryAt: true, createdAt: true } });
    return hooks;
  }

  /** Returns the signing secret once; afterwards it can only be replaced. */
  async create(input: WebhookInput, actor: AuthenticatedStaff) {
    this.validateEvents(input.events);
    await this.validateUrl(input.url);
    const secret = generateWebhookSecret();
    const hook = await this.prisma.outboundWebhook.create({
      data: { name: input.name, url: input.url, events: [...new Set(input.events)], isActive: input.isActive ?? true, secret: encrypt(secret, this.encryptionKey) as unknown as Prisma.InputJsonValue, createdBy: actor.id },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "webhook.create", entityType: "outbound_webhook", entityId: hook.id, after: { name: input.name, url: input.url, events: hook.events } });
    return { id: hook.id, name: hook.name, url: hook.url, events: hook.events, isActive: hook.isActive, secret };
  }

  async update(id: string, input: Partial<WebhookInput>, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    if (input.events) this.validateEvents(input.events);
    if (input.url && input.url !== before.url) await this.validateUrl(input.url);
    const enabling = input.isActive === true && !before.isActive;
    const hook = await this.prisma.outboundWebhook.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.events !== undefined ? { events: [...new Set(input.events)] } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        // Switching an endpoint back on starts it with a clean slate.
        ...(enabling ? { consecutiveFailures: 0, disabledReason: null } : {}),
      },
      select: { id: true, name: true, url: true, events: true, isActive: true },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "webhook.update", entityType: "outbound_webhook", entityId: id, before: { name: before.name, url: before.url, events: before.events, isActive: before.isActive }, after: input });
    return hook;
  }

  async rotateSecret(id: string, actor: AuthenticatedStaff) {
    await this.get(id);
    const secret = generateWebhookSecret();
    await this.prisma.outboundWebhook.update({ where: { id }, data: { secret: encrypt(secret, this.encryptionKey) as unknown as Prisma.InputJsonValue } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "webhook.rotate_secret", entityType: "outbound_webhook", entityId: id });
    return { id, secret };
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    await this.prisma.outboundWebhook.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "webhook.delete", entityType: "outbound_webhook", entityId: id, before: { name: before.name, url: before.url } });
  }

  private async get(id: string) {
    const hook = await this.prisma.outboundWebhook.findUnique({ where: { id } });
    if (!hook) throw new NotFoundException({ code: "WEBHOOK_NOT_FOUND", message: "Webhook not found" });
    return hook;
  }

  // ------------------------------------------------------------------ queueing events

  /** Queues `event` for every active endpoint subscribed to it. Does nothing while webhooks are switched off. */
  async enqueueEvent(event: string, data: unknown): Promise<number> {
    if (!(await this.settings.getValue<boolean>("webhooks.enabled"))) return 0;
    const hooks = await this.prisma.outboundWebhook.findMany({ where: { isActive: true, events: { has: event } }, select: { id: true } });
    if (hooks.length === 0) return 0;
    const eventId = `evt_${randomUUID()}`;
    const payload = { id: eventId, event, createdAt: new Date().toISOString(), data };
    await this.prisma.webhookDelivery.createMany({
      data: hooks.map((h) => ({ webhookId: h.id, eventId, event, payload: payload as unknown as Prisma.InputJsonValue, status: "pending" as const, nextAttemptAt: new Date() })),
    });
    return hooks.length;
  }

  /** Called from the order lifecycle (after commit) with the automation trigger name, e.g. `order.shipped`. */
  async dispatchOrderEvent(event: string, orderId: string): Promise<void> {
    if (!(await this.settings.getValue<boolean>("webhooks.enabled"))) return;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        channel: true,
        currency: true,
        subtotal: true,
        discountTotal: true,
        shippingFee: true,
        total: true,
        paidTotal: true,
        codAmount: true,
        shippingAddress: true,
        billingContact: true,
        createdAt: true,
        items: { select: { sku: true, title: true, quantity: true, unitPrice: true, lineTotal: true } },
      },
    });
    if (order) await this.enqueueEvent(event, { order });
  }

  /** A synthetic event so staff can check their endpoint and signature handling. Sent immediately and reported back. */
  async sendTest(id: string, actor: AuthenticatedStaff) {
    const hook = await this.get(id);
    const eventId = `evt_${randomUUID()}`;
    const payload = { id: eventId, event: "webhook.test", createdAt: new Date().toISOString(), data: { message: "This is a test event from your store." } };
    const delivery = await this.prisma.webhookDelivery.create({ data: { webhookId: id, eventId, event: "webhook.test", payload: payload as unknown as Prisma.InputJsonValue, status: "pending", nextAttemptAt: null } });
    const maxAttempts = 1; // A test is one shot — retrying a ping only hides a broken endpoint.
    await this.attempt(delivery.id, hook, maxAttempts, Number.MAX_SAFE_INTEGER);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "webhook.test", entityType: "outbound_webhook", entityId: id });
    return this.prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id }, select: { id: true, status: true, responseStatus: true, lastError: true, attempts: true } });
  }

  // ------------------------------------------------------------------ delivery

  /** Sweep: sends every delivery that is due. Run by the scheduler each tick. */
  async deliverDue(): Promise<{ attempted: number }> {
    const [maxAttempts, autoDisableAfter] = await Promise.all([this.settings.getValue<number>("webhooks.maxAttempts"), this.settings.getValue<number>("webhooks.autoDisableAfterFailures")]);
    const due = await this.prisma.webhookDelivery.findMany({
      where: { status: "pending", nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: "asc" },
      take: DELIVERY_BATCH,
      include: { webhook: true },
    });
    for (const delivery of due) {
      if (!delivery.webhook.isActive) {
        // Endpoint was switched off while this was queued — don't send, don't retry.
        await this.prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "failed", nextAttemptAt: null, lastError: "Endpoint is switched off" } });
        continue;
      }
      await this.attempt(delivery.id, delivery.webhook, maxAttempts, autoDisableAfter);
    }
    await this.pruneHistory();
    return { attempted: due.length };
  }

  /** Re-queues a failed delivery for one more round of attempts (e.g. after fixing the receiver). */
  async retry(deliveryId: string, actor: AuthenticatedStaff) {
    const delivery = await this.prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException({ code: "DELIVERY_NOT_FOUND", message: "Delivery not found" });
    if (delivery.status === "succeeded") throw new BadRequestException({ code: "ALREADY_DELIVERED", message: "This delivery already succeeded" });
    await this.prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "webhook.retry", entityType: "webhook_delivery", entityId: deliveryId });
    return { id: deliveryId, status: "pending" as const };
  }

  async deliveries(webhookId: string) {
    await this.get(webhookId);
    return this.prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, eventId: true, event: true, status: true, attempts: true, responseStatus: true, lastError: true, nextAttemptAt: true, createdAt: true, deliveredAt: true },
    });
  }

  private async attempt(deliveryId: string, hook: { id: string; url: string; secret: unknown; consecutiveFailures: number }, maxAttempts: number, autoDisableAfter: number) {
    const delivery = await this.prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    const body = JSON.stringify(delivery.payload);
    let responseStatus: number | null = null;
    let error: string | null = null;

    try {
      if (!isEncryptedPayload(hook.secret)) throw new Error("Signing secret is unreadable — rotate it");
      const secret = decrypt(hook.secret, this.encryptionKey);
      await assertPublicHttpsUrl(hook.url);
      const timestamp = Math.floor(Date.now() / 1000);
      const response = await fetch(hook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "CommercePlatform-Webhooks/1",
          "x-webhook-id": delivery.eventId,
          "x-webhook-event": delivery.event,
          "x-webhook-signature": signatureHeader(secret, timestamp, body),
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      responseStatus = response.status;
      if (!isSuccessStatus(response.status)) error = `Receiver answered HTTP ${response.status}`;
    } catch (caught) {
      error = errorMessage(caught);
    }

    const ok = error === null;
    const attempts = delivery.attempts + 1;
    const outcome = afterAttempt(ok, attempts, maxAttempts, new Date());
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: outcome.status,
        attempts,
        responseStatus,
        lastError: error,
        nextAttemptAt: outcome.status === "pending" ? outcome.nextAttemptAt : null,
        ...(ok ? { deliveredAt: new Date() } : {}),
      },
    });

    const failures = ok ? 0 : hook.consecutiveFailures + 1;
    const disable = !ok && shouldAutoDisable(failures, autoDisableAfter);
    await this.prisma.outboundWebhook.update({
      where: { id: hook.id },
      data: { consecutiveFailures: failures, lastDeliveryAt: new Date(), ...(disable ? { isActive: false, disabledReason: `Switched off automatically after ${failures} failed deliveries in a row` } : {}) },
    });
    if (disable) this.logger.warn(`Webhook ${hook.id} switched off after ${failures} consecutive failures`);
  }

  private async pruneHistory() {
    // The sweep runs every minute; history only needs trimming now and then.
    if (Date.now() - this.lastPruneAt < 3_600_000) return;
    this.lastPruneAt = Date.now();
    const cutoff = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
    await this.prisma.webhookDelivery.deleteMany({ where: { status: { in: ["succeeded", "failed"] }, createdAt: { lt: cutoff } } });
  }
}
