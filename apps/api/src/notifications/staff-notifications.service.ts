import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationDriversService } from "./notification-drivers.service";
import { PushService } from "../push/push.service";

export interface StaffNotificationPayload {
  type: string;
  title: { bn: string; en: string };
  body: { bn: string; en: string };
  link?: string;
  /** Staff who should additionally get an emailed copy (§16 M7: "in-app + email") — permission-gated by the caller, not re-checked here. */
  permission: string;
}

/**
 * Staff in-app bell + email (docs/PROJECT_SPEC.md §16 M7; deferred from M1's
 * `notifications_admin` — see docs/DECISIONS.md there). Deliberately *not*
 * built on the customer-facing `MessageTemplate`/`NotificationChannelRule`
 * system: staff notifications are a small, fixed set of operational events
 * (currently just "new order"), always in-app + best-effort email, with no
 * per-event admin configuration needed — building the full channel-matrix
 * machinery for a one-event feature would be speculative scope.
 */
@Injectable()
export class StaffNotificationsService {
  private readonly logger = new Logger(StaffNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly drivers: NotificationDriversService,
    private readonly push: PushService,
  ) {}

  async notifyStaffWithPermission(payload: StaffNotificationPayload): Promise<void> {
    const staff = await this.prisma.staffUser.findMany({
      where: { status: "active", deletedAt: null, roles: { some: { role: { permissions: { some: { permission: payload.permission } } } } } },
      select: { id: true, email: true, locale: true },
    });
    for (const user of staff) await this.deliver(user, payload, true);
  }

  /** One specific staff member (e.g. the requester of an approval) - in-app + push, no email. */
  async notifyStaff(staffUserId: string, payload: Omit<StaffNotificationPayload, "permission">): Promise<void> {
    const user = await this.prisma.staffUser.findFirst({ where: { id: staffUserId, status: "active", deletedAt: null }, select: { id: true, email: true, locale: true } });
    if (user) await this.deliver(user, payload, false);
  }

  private async deliver(user: { id: string; email: string; locale: string }, payload: Omit<StaffNotificationPayload, "permission">, email: boolean): Promise<void> {
    const locale: "bn" | "en" = user.locale === "en" ? "en" : "bn";
    await this.prisma.staffNotification.create({
      data: { staffUserId: user.id, type: payload.type, title: payload.title[locale], body: payload.body[locale], link: payload.link },
    });
    await this.push.sendToStaff(user.id, { title: payload.title[locale], body: payload.body[locale], url: payload.link });

    if (!email) return;
    try {
      const { driver } = await this.drivers.resolveEmail();
      await driver.send({ to: user.email, subject: payload.title[locale], html: `<p>${payload.body[locale]}</p>` });
    } catch (error) {
      this.logger.warn(`Staff email notification failed for ${user.email}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  async notifyNewOrder(order: { id: string; orderNumber: string }): Promise<void> {
    await this.notifyStaffWithPermission({
      type: "new_order",
      permission: "orders.manage",
      link: `/orders/${order.id}`,
      title: { bn: "নতুন অর্ডার এসেছে", en: "New order received" },
      body: {
        bn: `অর্ডার ${order.orderNumber} এইমাত্র প্লেস করা হয়েছে।`,
        en: `Order ${order.orderNumber} was just placed.`,
      },
    });
  }

  /** M11 admin PWA push: a high-risk order needs eyes quickly. */
  async notifyHighRiskOrder(order: { id: string; orderNumber: string }): Promise<void> {
    await this.notifyStaffWithPermission({
      type: "high_risk_order",
      permission: "orders.manage",
      link: `/orders/${order.id}`,
      title: { bn: "হাই-রিস্ক অর্ডার", en: "High-risk order" },
      body: { bn: `অর্ডার ${order.orderNumber} হাই-রিস্ক হিসেবে চিহ্নিত হয়েছে।`, en: `Order ${order.orderNumber} was flagged high risk.` },
    });
  }

  async notifyPaymentFailed(order: { id: string; orderNumber: string }): Promise<void> {
    await this.notifyStaffWithPermission({
      type: "payment_failed",
      permission: "orders.manage",
      link: `/orders/${order.id}`,
      title: { bn: "পেমেন্ট ব্যর্থ হয়েছে", en: "Payment failed" },
      body: { bn: `অর্ডার ${order.orderNumber}-এর পেমেন্ট ব্যর্থ হয়েছে।`, en: `A payment for order ${order.orderNumber} failed.` },
    });
  }

  /** Alerts once, at the moment an order's reservation pushes a variant's available stock down to or below its low-stock threshold (so a variant already low doesn't re-alert on every order). */
  async notifyLowStockCrossings(items: { variantId: string; quantity: number }[]): Promise<void> {
    for (const item of items) {
      const levels = await this.prisma.inventoryLevel.findMany({
        where: { variantId: item.variantId, lowStockThreshold: { not: null } },
        include: { variant: { select: { sku: true } } },
      });
      for (const level of levels) {
        const threshold = level.lowStockThreshold!;
        if (level.available <= threshold && level.available + item.quantity > threshold) {
          await this.notifyStaffWithPermission({
            type: "low_stock",
            permission: "inventory.manage",
            link: "/inventory",
            title: { bn: "স্টক কমে গেছে", en: "Low stock" },
            body: { bn: `${level.variant.sku}: মাত্র ${level.available}টি বাকি।`, en: `${level.variant.sku}: only ${level.available} left.` },
          });
        }
      }
    }
  }

  async listMine(staffUserId: string, page: number, pageSize: number) {
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.staffNotification.findMany({
        where: { staffUserId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.staffNotification.count({ where: { staffUserId } }),
      this.prisma.staffNotification.count({ where: { staffUserId, readAt: null } }),
    ]);
    return { items, total, page, pageSize, unreadCount };
  }

  async markRead(staffUserId: string, id: string): Promise<void> {
    await this.prisma.staffNotification.updateMany({ where: { id, staffUserId, readAt: null }, data: { readAt: new Date() } });
  }

  async markAllRead(staffUserId: string): Promise<void> {
    await this.prisma.staffNotification.updateMany({ where: { staffUserId, readAt: null }, data: { readAt: new Date() } });
  }
}
