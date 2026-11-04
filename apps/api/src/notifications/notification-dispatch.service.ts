import { Injectable, Logger } from "@nestjs/common";
import type { NotificationChannel } from "@clothing/shared/notifications";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationDriversService } from "./notification-drivers.service";
import { NotificationsService } from "./notifications.service";

const BATCH_SIZE = 20;
const BACKOFF_BASE_SECONDS = 30;
const BACKOFF_CAP_SECONDS = 60 * 60;

/**
 * The queued-send sweep (docs/PROJECT_SPEC.md §6.11: "all sends are queued,
 * retried with backoff"). Registered with `SchedulerService.registerRecurring`
 * (the same cheap, idempotent, no-job-row mechanism M2's publish sweep and
 * M3's price-schedule sweep already use) rather than a tracked
 * `scheduled_tasks` row — there's nothing per-run worth tracking beyond the
 * log rows themselves.
 */
@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly drivers: NotificationDriversService,
    private readonly notifications: NotificationsService,
  ) {}

  async runSweep(): Promise<{ processed: number }> {
    const due = await this.prisma.notificationLog.findMany({
      where: { status: { in: ["queued", "retrying"] }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
    });
    for (const log of due) {
      await this.attempt(log);
    }
    return { processed: due.length };
  }

  private async attempt(log: { id: string; channel: string; to: string; subject: string | null; body: string; attempts: number; maxAttempts: number; event: string; fallbackIndex: number; recipientType: string; recipientId: string | null; locale: string; contacts: unknown; variables: unknown; relatedEntityType: string | null; relatedEntityId: string | null }): Promise<void> {
    try {
      const { driverName, instanceId } = await this.drivers.send(log.channel as NotificationChannel, log.to, log.subject, log.body);
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: "sent", attempts: log.attempts + 1, driver: driverName, providerInstanceId: instanceId, lastError: null },
      });
      if (log.relatedEntityType === "order" && log.relatedEntityId) {
        await this.prisma.orderEvent.create({
          data: { orderId: log.relatedEntityId, type: "notification_sent", data: { event: log.event, channel: log.channel, driver: driverName } },
        });
      }
    } catch (error) {
      await this.handleFailure(log, error instanceof Error ? error.message : "Unknown error");
    }
  }

  private async handleFailure(
    log: { id: string; attempts: number; maxAttempts: number; event: string; fallbackIndex: number; recipientType: string; recipientId: string | null; locale: string; contacts: unknown; variables: unknown; relatedEntityType: string | null; relatedEntityId: string | null },
    message: string,
  ): Promise<void> {
    const attempts = log.attempts + 1;
    if (attempts < log.maxAttempts) {
      const delaySeconds = Math.min(BACKOFF_BASE_SECONDS * 2 ** (attempts - 1), BACKOFF_CAP_SECONDS);
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: "retrying", attempts, lastError: message, nextAttemptAt: new Date(Date.now() + delaySeconds * 1000) },
      });
      return;
    }

    await this.prisma.notificationLog.update({ where: { id: log.id }, data: { status: "failed", attempts, lastError: message } });
    const fellBack = await this.notifications.createFallbackLog(log);
    if (!fellBack) {
      this.logger.warn(`Notification "${log.event}" exhausted every channel for recipient ${log.recipientType}:${log.recipientId ?? "guest"}`);
    }
  }
}
