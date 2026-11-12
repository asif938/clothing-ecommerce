import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { NotificationChannel as PrismaChannel, Prisma } from "@clothing/db";
import { renderTemplate, type NotificationChannel } from "@clothing/shared/notifications";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationDriversService } from "../notifications/notification-drivers.service";
import { isUniqueViolation } from "../common/document-number";

export interface MarketingRecipient {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  locale: string;
  pointsBalance: number;
  marketingConsentSms: boolean;
  marketingConsentEmail: boolean;
  marketingConsentWhatsapp: boolean;
  hasPush: boolean;
}

export const RECIPIENT_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  locale: true,
  pointsBalance: true,
  marketingConsentSms: true,
  marketingConsentEmail: true,
  marketingConsentWhatsapp: true,
  _count: { select: { pushSubscriptions: true } },
} as const;

type RecipientRow = Prisma.CustomerGetPayload<{ select: typeof RECIPIENT_SELECT }>;

export function toRecipient(row: RecipientRow): MarketingRecipient {
  const { _count, ...rest } = row;
  return { ...rest, hasPush: _count.pushSubscriptions > 0 };
}

export interface MarketingCopy {
  subjectBn?: string | null;
  subjectEn?: string | null;
  bodyBn: string;
  bodyEn: string;
}

/** Where a customer can be reached on `channel`, or null; consent is checked separately. */
export function contactFor(channel: NotificationChannel, r: MarketingRecipient): string | null {
  if (channel === "email") return r.email;
  if (channel === "push") return r.hasPush ? r.id : null;
  return r.phone;
}

/** Marketing consent per channel (§5.5 `marketing_consent_*`). Push is opt-in by nature (the browser permission), so it needs no extra flag. */
export function hasConsent(channel: NotificationChannel, r: MarketingRecipient): boolean {
  if (channel === "email") return r.marketingConsentEmail;
  if (channel === "whatsapp") return r.marketingConsentWhatsapp;
  if (channel === "sms") return r.marketingConsentSms;
  return true;
}

/** First channel in `order` the recipient can be reached on (and, when required, consented to). */
export function pickChannel(order: NotificationChannel[], r: MarketingRecipient, requireConsent: boolean): NotificationChannel | null {
  for (const channel of order) {
    if (!contactFor(channel, r)) continue;
    if (requireConsent && !hasConsent(channel, r)) continue;
    return channel;
  }
  return null;
}

/**
 * Shared plumbing for journeys and broadcasts (docs/PROJECT_SPEC.md §8.2
 * Marketing, §16 M13): renders the per-send bilingual copy with the same
 * `{variable}` syntax as message templates and writes a `notification_logs`
 * row, so delivery, retries, the Notifications → Logs screen and delivery
 * reports all reuse M7's dispatch pipeline unchanged. Marketing copy lives
 * on the journey/broadcast itself (not in `message_templates`), so a failed
 * channel is retried but not re-routed to another channel.
 */
@Injectable()
export class MarketingMessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly drivers: NotificationDriversService,
  ) {}

  async baseVariables(r: MarketingRecipient): Promise<Record<string, string>> {
    const common = await this.notifications.commonVariables();
    const storefrontUrl = process.env.STOREFRONT_URL ?? "";
    return { ...common, customer_name: r.name ?? "", shop_url: storefrontUrl, points_balance: String(r.pointsBalance) };
  }

  render(copy: MarketingCopy, locale: string, variables: Record<string, string | number | null | undefined>): { subject: string | null; body: string } {
    const en = locale === "en";
    const subjectTemplate = en ? copy.subjectEn : copy.subjectBn;
    return { subject: subjectTemplate ? renderTemplate(subjectTemplate, variables) : null, body: renderTemplate(en ? copy.bodyEn : copy.bodyBn, variables) };
  }

  async queue(
    db: Prisma.TransactionClient | PrismaService,
    input: { event: "marketing_broadcast" | "journey_message"; channel: NotificationChannel; recipient: MarketingRecipient; copy: MarketingCopy; variables: Record<string, string | number | null | undefined>; related: { type: string; id: string } },
  ): Promise<void> {
    const to = contactFor(input.channel, input.recipient);
    if (!to) return;
    const locale = input.recipient.locale === "en" ? "en" : "bn";
    const rendered = this.render(input.copy, locale, input.variables);
    await db.notificationLog.create({
      data: {
        event: input.event,
        channel: input.channel as PrismaChannel,
        recipientType: "customer",
        recipientId: input.recipient.id,
        to,
        contacts: { [input.channel]: to } as Prisma.InputJsonValue,
        locale,
        subject: input.channel === "email" ? rendered.subject : null,
        body: rendered.body,
        status: "queued",
        relatedEntityType: input.related.type,
        relatedEntityId: input.related.id,
        variables: input.variables as Prisma.InputJsonValue,
      },
    });
  }

  /** Sends straight through the active driver (no queue) so staff see the real message on their own phone/inbox before sending to thousands. */
  async sendTest(channel: NotificationChannel, to: string, copy: MarketingCopy, locale: string, variables: Record<string, string>): Promise<{ driver: string }> {
    if (channel === "push") throw new BadRequestException({ code: "TEST_PUSH_UNSUPPORTED", message: "Push can't be test-sent to an address — send to a segment containing your own account instead." });
    const rendered = this.render(copy, locale, variables);
    try {
      const result = await this.drivers.send(channel, to, rendered.subject, rendered.body);
      await this.notifications.logImmediate({ event: "marketing_broadcast", channel, recipientType: "guest", to, locale, body: rendered.body, subject: rendered.subject, status: "sent", driver: result.driverName });
      return { driver: result.driverName };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Send failed";
      await this.notifications.logImmediate({ event: "marketing_broadcast", channel, recipientType: "guest", to, locale, body: rendered.body, subject: rendered.subject, status: "failed", lastError: message });
      throw new BadRequestException({ code: "TEST_SEND_FAILED", message });
    }
  }

  /** Mints a single-use code for `customerId` under a code-type discount (§16 M13 unique-code campaigns). */
  async mintPersonalCode(db: Prisma.TransactionClient | PrismaService, discountId: string, prefix: string, customerId: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = `${prefix}${randomBytes(4).toString("hex").toUpperCase().slice(0, 6)}`;
      try {
        await db.discountCode.create({ data: { discountId, code, assignedTo: customerId } });
        return code;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new Error("Couldn't generate a unique code");
  }

  async assertCodeDiscount(discountId: string): Promise<void> {
    const discount = await this.prisma.discount.findUnique({ where: { id: discountId }, select: { type: true } });
    if (!discount || discount.type !== "code") throw new BadRequestException({ code: "DISCOUNT_NOT_CODE", message: "Pick a code-type discount for personal codes." });
  }
}
