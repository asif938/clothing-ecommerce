import { Injectable, Logger } from "@nestjs/common";
import type { NotificationChannel as PrismaChannel, Prisma } from "@clothing/db";
import { t } from "@clothing/shared";
import { renderTemplate } from "@clothing/shared/notifications";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { NotificationsService } from "../notifications/notifications.service";
import { StoreReviewsService } from "./store-reviews.service";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Orders delivered longer ago than the delay plus this are never asked — so turning the feature on doesn't message months of old orders. */
const WINDOW_DAYS = 7;
const BATCH = 50;
const DELIVERED_STATUSES = ["delivered", "partially_delivered", "completed"] as const;
/** `notification_logs.related_entity_type` that marks an order as already asked (one request per order, ever). */
export const REVIEW_REQUEST_RELATED_TYPE = "review_request";

type Channel = "sms" | "whatsapp" | "email";

export interface ReviewRequestCandidate {
  id: string;
  customerId: string | null;
  billingContact: unknown;
  customer: { name: string | null; phone: string | null; email: string | null; locale: string } | null;
}

/** Where to send on `channel` for this order: the customer account's details first, then the order's own contact (guest orders). */
export function reviewRequestContact(order: ReviewRequestCandidate, channel: Channel): string | null {
  const billing = (order.billingContact as { phone?: string; email?: string } | null) ?? null;
  if (channel === "email") return order.customer?.email || billing?.email || null;
  return order.customer?.phone || billing?.phone || null;
}

/**
 * One review request per delivered order, a few days after delivery
 * (Settings → Reviews), with a login-free review link — so guest orders,
 * the usual case for COD, get asked too. Goes out through the normal
 * notification queue (retries, Notifications → Logs) as a `journey_message`
 * with `related_entity_type = "review_request"`, which is also how an order
 * is remembered as asked; no schema change needed. Orders already handled by
 * a post-purchase journey, or with every item already reviewed, are skipped.
 */
@Injectable()
export class ReviewRequestService {
  private readonly logger = new Logger(ReviewRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly storeReviews: StoreReviewsService,
  ) {}

  async sweep(now = new Date()): Promise<{ queued: number }> {
    if (!(await this.settings.getValue<boolean>("reviews.requestEnabled"))) return { queued: 0 };
    const delayDays = Number(await this.settings.getValue<string>("reviews.requestDelayDays")) || 3;
    const dueBefore = new Date(now.getTime() - delayDays * DAY_MS);
    const notBefore = new Date(dueBefore.getTime() - WINDOW_DAYS * DAY_MS);

    const inWindow = await this.prisma.order.findMany({
      where: { status: { in: [...DELIVERED_STATUSES] }, deliveredAt: { gte: notBefore, lte: dueBefore }, items: { some: { reviews: { none: {} } } } },
      select: { id: true },
      orderBy: { deliveredAt: "asc" },
    });
    if (inWindow.length === 0) return { queued: 0 };
    const ids = inWindow.map((o) => o.id);
    const [asked, inJourney] = await Promise.all([
      this.prisma.notificationLog.findMany({ where: { relatedEntityType: REVIEW_REQUEST_RELATED_TYPE, relatedEntityId: { in: ids } }, select: { relatedEntityId: true } }),
      this.prisma.journeyEnrollment.findMany({ where: { orderId: { in: ids }, journey: { type: "post_purchase" } }, select: { orderId: true } }),
    ]);
    const skip = new Set([...asked.map((a) => a.relatedEntityId), ...inJourney.map((e) => e.orderId)]);
    const pending = ids.filter((id) => !skip.has(id)).slice(0, BATCH);
    if (pending.length === 0) return { queued: 0 };

    const [channel, message, common] = await Promise.all([
      this.settings.getValue<Channel>("reviews.requestChannel"),
      this.settings.getValue<{ bn?: string; en?: string }>("reviews.requestMessage"),
      this.notifications.commonVariables(),
    ]);
    const orders = await this.prisma.order.findMany({
      where: { id: { in: pending } },
      select: { id: true, orderNumber: true, customerId: true, billingContact: true, customer: { select: { name: true, phone: true, email: true, locale: true } } },
    });

    let queued = 0;
    for (const order of orders) {
      const to = reviewRequestContact(order, channel);
      if (!to) continue;
      const locale = order.customer?.locale === "en" ? "en" : "bn";
      const billing = (order.billingContact as { name?: string } | null) ?? null;
      const storefrontUrl = process.env.STOREFRONT_URL ?? "";
      const variables = {
        ...common,
        customer_name: order.customer?.name || billing?.name || "",
        order_number: order.orderNumber,
        review_link: `${storefrontUrl}${locale === "en" ? "/en" : ""}/review/${this.storeReviews.reviewToken(order.id)}`,
      };
      const body = renderTemplate(t(message, locale), variables);
      try {
        await this.prisma.notificationLog.create({
          data: {
            event: "journey_message",
            channel: channel as PrismaChannel,
            recipientType: order.customerId ? "customer" : "guest",
            recipientId: order.customerId,
            to,
            contacts: { [channel]: to } as Prisma.InputJsonValue,
            locale,
            subject: channel === "email" ? renderTemplate(locale === "en" ? "How was order {order_number}?" : "অর্ডার {order_number} কেমন লাগলো?", variables) : null,
            body,
            status: "queued",
            relatedEntityType: REVIEW_REQUEST_RELATED_TYPE,
            relatedEntityId: order.id,
            variables: variables as Prisma.InputJsonValue,
          },
        });
        queued += 1;
      } catch (error) {
        this.logger.warn(`Review request for order ${order.id} not queued: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    return { queued };
  }
}
