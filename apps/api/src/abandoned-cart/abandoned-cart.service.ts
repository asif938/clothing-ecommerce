import { randomBytes } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import type { NotificationEvent as PrismaNotificationEvent } from "@clothing/db";
import { formatTakaFromPoisha } from "@clothing/shared/notifications";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { NotificationsService } from "../notifications/notifications.service";

const SEQUENCE_LENGTH = 3;

/**
 * Abandoned-cart recovery (docs/PROJECT_SPEC.md §16 M10) — two independent
 * recurring sweeps (`SchedulerService.registerRecurring`, the same cheap
 * no-job-row mechanism every prior milestone's sweep used):
 *
 *  1. `markAbandoned()` — flips an idle, contactable, non-empty `active`
 *     cart to `abandoned` (`Cart.abandonedAt`).
 *  2. `runSequence()` — walks every still-`abandoned`, not-yet-`recovered`
 *     cart forward through up to 3 reminders, each `stepDelaysMinutes[n]`
 *     minutes after `abandonedAt` (not after the previous reminder — a
 *     missed tick never compounds the delay). The configured step attaches
 *     a freshly-minted, single-use % discount code.
 */
@Injectable()
export class AbandonedCartService {
  private readonly logger = new Logger(AbandonedCartService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  async markAbandoned(): Promise<{ marked: number }> {
    const enabled = await this.settings.getValue<boolean>("marketing.abandonedCart.enabled");
    if (!enabled) return { marked: 0 };

    const idleMinutes = await this.settings.getValue<number>("marketing.abandonedCart.idleMinutes");
    const cutoff = new Date(Date.now() - idleMinutes * 60_000);
    const candidates = await this.prisma.cart.findMany({
      where: { status: "active", lastActivityAt: { lt: cutoff }, items: { some: {} }, OR: [{ contactPhone: { not: null } }, { contactEmail: { not: null } }] },
      select: { id: true },
      take: 200,
    });
    if (candidates.length === 0) return { marked: 0 };

    await this.prisma.cart.updateMany({ where: { id: { in: candidates.map((c) => c.id) } }, data: { status: "abandoned", abandonedAt: new Date() } });
    return { marked: candidates.length };
  }

  async runSequence(): Promise<{ sent: number }> {
    const enabled = await this.settings.getValue<boolean>("marketing.abandonedCart.enabled");
    if (!enabled) return { sent: 0 };

    const [stepDelaysMinutes, couponStep, couponPercentOff, couponValidHours] = await Promise.all([
      this.settings.getValue<number[]>("marketing.abandonedCart.stepDelaysMinutes"),
      this.settings.getValue<number>("marketing.abandonedCart.couponStep"),
      this.settings.getValue<number>("marketing.abandonedCart.couponPercentOff"),
      this.settings.getValue<number>("marketing.abandonedCart.couponValidHours"),
    ]);

    const carts = await this.prisma.cart.findMany({
      where: { status: "abandoned", recoveredAt: null, recoverySequenceStep: { lt: SEQUENCE_LENGTH } },
      include: { items: true },
      take: 200,
    });

    const commonVariables = await this.notifications.commonVariables();
    const storefrontUrl = process.env.STOREFRONT_URL ?? "";
    let sent = 0;

    for (const cart of carts) {
      if (!cart.abandonedAt) continue;
      const stepIndex = cart.recoverySequenceStep; // 0-based: next step is stepIndex + 1
      const delayMinutes = stepDelaysMinutes[stepIndex];
      if (delayMinutes === undefined) continue;
      const dueAt = cart.abandonedAt.getTime() + delayMinutes * 60_000;
      if (Date.now() < dueAt) continue;

      const nextStep = stepIndex + 1;
      const cartTotal = cart.items.reduce((sum, item) => sum + item.addedPrice * item.quantity, 0);

      let couponCode = "";
      if (nextStep === couponStep && couponPercentOff > 0) {
        try {
          couponCode = await this.createRecoveryCoupon(couponPercentOff, couponValidHours);
        } catch (error) {
          this.logger.error(`Failed to create a recovery coupon for cart ${cart.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }

      try {
        await this.prisma.$transaction(async (tx) => {
          await this.notifications.enqueue(tx, {
            event: `abandoned_cart_${nextStep}` as PrismaNotificationEvent,
            recipientType: cart.customerId ? "customer" : "guest",
            recipientId: cart.customerId,
            locale: cart.locale,
            contacts: { sms: cart.contactPhone, whatsapp: cart.contactPhone, email: cart.contactEmail, push: cart.customerId },
            variables: {
              ...commonVariables,
              customer_name: cart.contactName ?? "",
              cart_total: formatTakaFromPoisha(cartTotal),
              cart_url: `${storefrontUrl}/cart`,
              coupon_code: couponCode,
              coupon_percent_off: String(couponPercentOff),
            },
            related: { type: "cart", id: cart.id },
          });
          await tx.cart.update({ where: { id: cart.id }, data: { recoverySequenceStep: nextStep } });
        });
        sent += 1;
      } catch (error) {
        this.logger.error(`Failed to send abandoned-cart reminder ${nextStep} for cart ${cart.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    return { sent };
  }

  private async createRecoveryCoupon(percentOff: number, validHours: number): Promise<string> {
    const code = `COMEBACK${randomBytes(3).toString("hex").toUpperCase()}`;
    await this.prisma.discount.create({
      data: {
        name: "Abandoned cart recovery",
        type: "code",
        code,
        valueType: "percent",
        value: percentOff,
        status: "active",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + validHours * 60 * 60 * 1000),
        limits: { totalUses: 1 },
      },
    });
    return code;
  }

  /** Admin visibility list (`/marketing/abandoned-carts`) — not paginated server-side yet, see docs/PROGRESS.md "known issues" (small-catalog MVP trade-off, same as several other M10 admin screens). */
  async listAbandoned() {
    return await this.prisma.cart.findMany({
      where: { status: "abandoned" },
      include: { items: true, customer: { select: { name: true, phone: true } } },
      orderBy: { abandonedAt: "desc" },
      take: 200,
    });
  }
}
