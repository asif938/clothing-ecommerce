import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationDriversService } from "./notification-drivers.service";

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
  ) {}

  async notifyStaffWithPermission(payload: StaffNotificationPayload): Promise<void> {
    const staff = await this.prisma.staffUser.findMany({
      where: { status: "active", deletedAt: null, roles: { some: { role: { permissions: { some: { permission: payload.permission } } } } } },
      select: { id: true, email: true, locale: true },
    });

    for (const user of staff) {
      const locale: "bn" | "en" = user.locale === "en" ? "en" : "bn";
      await this.prisma.staffNotification.create({
        data: { staffUserId: user.id, type: payload.type, title: payload.title[locale], body: payload.body[locale], link: payload.link },
      });

      try {
        const { driver } = await this.drivers.resolveEmail();
        await driver.send({ to: user.email, subject: payload.title[locale], html: `<p>${payload.body[locale]}</p>` });
      } catch (error) {
        this.logger.warn(`Staff email notification failed for ${user.email}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
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
