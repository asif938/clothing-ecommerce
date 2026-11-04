import { Injectable, Logger } from "@nestjs/common";
import type { NotificationChannel as PrismaNotificationChannel, NotificationEvent as PrismaNotificationEvent, Prisma } from "@clothing/db";
import { getNotificationEventDefinition, renderTemplate, type NotificationChannel } from "@clothing/shared/notifications";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";

export type RecipientType = "customer" | "guest";

export interface EnqueueInput {
  event: string;
  recipientType: RecipientType;
  recipientId?: string | null;
  locale: string;
  contacts: { sms?: string | null; whatsapp?: string | null; email?: string | null };
  variables: Record<string, string | number | null | undefined>;
  related?: { type: string; id: string };
}

export interface RenderedMessage {
  subject: string | null;
  body: string;
}

/**
 * Core notification logic (docs/PROJECT_SPEC.md §6.11): resolves the
 * per-event channel matrix, renders the first eligible channel's template,
 * and writes one `notification_logs` row — the actual network send happens
 * later, off the caller's transaction, in `NotificationDispatchService`'s
 * sweep. "Eligible" means the recipient has a usable address for that
 * channel (a phone for sms/whatsapp, an email for email) *and* an active
 * template exists for (event, channel); a channel failing either check is
 * skipped exactly like a channel whose driver later turns out unavailable —
 * both just move to the next channel in the rule's order (§6.11: "WhatsApp
 * first, fall back to SMS if not delivered or not available").
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async commonVariables(): Promise<Record<string, string>> {
    const [brandName, supportPhone] = await Promise.all([
      this.settings.getValue<{ bn: string; en: string }>("brand.name"),
      this.settings.getValue<string | null>("brand.phone"),
    ]);
    return { brand_name: brandName?.bn ?? brandName?.en ?? "", support_phone: supportPhone ?? "" };
  }

  async resolveChannelOrder(db: Prisma.TransactionClient | PrismaService, event: string): Promise<NotificationChannel[]> {
    const rule = await db.notificationChannelRule.findUnique({ where: { event: event as PrismaNotificationEvent } });
    if (rule) return rule.channels as NotificationChannel[];
    return getNotificationEventDefinition(event)?.defaultChannelOrder ?? [];
  }

  async renderForChannel(
    db: Prisma.TransactionClient | PrismaService,
    event: string,
    channel: NotificationChannel,
    locale: string,
    variables: Record<string, string | number | null | undefined>,
  ): Promise<RenderedMessage | null> {
    const template = await db.messageTemplate.findUnique({
      where: { event_channel: { event: event as PrismaNotificationEvent, channel: channel as PrismaNotificationChannel } },
    });
    if (!template || !template.isActive) return null;
    const bodyTemplate = locale === "en" ? template.bodyEn : template.bodyBn;
    const subjectTemplate = channel === "email" ? (locale === "en" ? template.subjectEn : template.subjectBn) : null;
    return {
      body: renderTemplate(bodyTemplate, variables),
      subject: subjectTemplate ? renderTemplate(subjectTemplate, variables) : null,
    };
  }

  private contactFor(channel: NotificationChannel, contacts: EnqueueInput["contacts"]): string | null {
    if (channel === "email") return contacts.email ?? null;
    if (channel === "whatsapp") return contacts.whatsapp ?? null;
    return contacts.sms ?? null;
  }

  /** Call inside the caller's own transaction (same pattern as `StockReservationService.release(tx, ...)`) so the log row commits atomically with whatever triggered it. */
  async enqueue(db: Prisma.TransactionClient, input: EnqueueInput): Promise<void> {
    const order = await this.resolveChannelOrder(db, input.event);
    for (let index = 0; index < order.length; index += 1) {
      const channel = order[index]!;
      const to = this.contactFor(channel, input.contacts);
      if (!to) continue;
      const rendered = await this.renderForChannel(db, input.event, channel, input.locale, input.variables);
      if (!rendered) continue;

      await db.notificationLog.create({
        data: {
          event: input.event as PrismaNotificationEvent,
          channel: channel as PrismaNotificationChannel,
          fallbackIndex: index,
          recipientType: input.recipientType,
          recipientId: input.recipientId ?? null,
          to,
          contacts: input.contacts as Prisma.InputJsonValue,
          locale: input.locale,
          subject: rendered.subject,
          body: rendered.body,
          status: "queued",
          relatedEntityType: input.related?.type ?? null,
          relatedEntityId: input.related?.id ?? null,
          variables: input.variables as Prisma.InputJsonValue,
        },
      });
      return;
    }
    this.logger.warn(`No eligible channel for notification event "${input.event}" (recipient ${input.recipientType}:${input.recipientId ?? "guest"})`);
  }

  /**
   * OTP (§6.13) needs to be sent synchronously — the customer is waiting
   * for it — so it bypasses the queued/retried dispatch pipeline entirely
   * and goes straight through the caller's own SMS driver call. This only
   * renders the bilingual template text and records the outcome for the
   * Notifications Log screen; `OtpService` still owns the actual send
   * (unchanged from M5) so OTP's existing rate-limiting/resend behavior
   * isn't touched by this milestone.
   */
  async renderOtpMessage(locale: string, otp: string): Promise<RenderedMessage> {
    const variables = { ...(await this.commonVariables()), otp };
    const rendered = await this.renderForChannel(this.prisma, "otp_verification", "sms", locale, variables);
    return rendered ?? { subject: null, body: `Your OTP code is ${otp}.` };
  }

  /**
   * Called by `NotificationDispatchService` once a channel attempt has
   * exhausted its retries (§6.11's fallback behavior) — creates the next
   * eligible channel's log row from the *exhausted* row's own
   * `contacts`/`variables`, so the fallback never needs to re-derive them
   * from whatever order/customer originally triggered the notification.
   * Returns `false` when no later channel in the rule's order is reachable
   * (no contact, or no active template), meaning the notification is fully
   * failed.
   */
  async createFallbackLog(exhausted: {
    event: string;
    fallbackIndex: number;
    recipientType: string;
    recipientId: string | null;
    locale: string;
    contacts: unknown;
    variables: unknown;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
  }): Promise<boolean> {
    const order = await this.resolveChannelOrder(this.prisma, exhausted.event);
    const contacts = (exhausted.contacts as EnqueueInput["contacts"] | null) ?? {};
    const variables = (exhausted.variables as Record<string, string | number | null> | null) ?? {};

    for (let index = exhausted.fallbackIndex + 1; index < order.length; index += 1) {
      const channel = order[index]!;
      const to = this.contactFor(channel, contacts);
      if (!to) continue;
      const rendered = await this.renderForChannel(this.prisma, exhausted.event, channel, exhausted.locale, variables);
      if (!rendered) continue;

      await this.prisma.notificationLog.create({
        data: {
          event: exhausted.event as PrismaNotificationEvent,
          channel: channel as PrismaNotificationChannel,
          fallbackIndex: index,
          recipientType: exhausted.recipientType as RecipientType,
          recipientId: exhausted.recipientId,
          to,
          contacts: contacts as Prisma.InputJsonValue,
          locale: exhausted.locale,
          subject: rendered.subject,
          body: rendered.body,
          status: "queued",
          relatedEntityType: exhausted.relatedEntityType,
          relatedEntityId: exhausted.relatedEntityId,
          variables: variables as Prisma.InputJsonValue,
        },
      });
      return true;
    }
    return false;
  }

  async logImmediate(input: {
    event: string;
    channel: NotificationChannel;
    recipientType: RecipientType;
    to: string;
    locale: string;
    body: string;
    subject?: string | null;
    status: "sent" | "failed";
    lastError?: string;
    driver?: string;
  }): Promise<void> {
    await this.prisma.notificationLog.create({
      data: {
        event: input.event as PrismaNotificationEvent,
        channel: input.channel as PrismaNotificationChannel,
        recipientType: input.recipientType,
        to: input.to,
        locale: input.locale,
        subject: input.subject ?? null,
        body: input.body,
        status: input.status,
        attempts: 1,
        lastError: input.lastError,
        driver: input.driver,
      },
    });
  }
}
