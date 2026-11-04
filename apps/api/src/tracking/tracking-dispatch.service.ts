import { Injectable, Logger } from "@nestjs/common";
import type { TrackingEventInput } from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingDriversService } from "./tracking-drivers.service";

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;

/**
 * The queued-send sweep for tracking events — same enqueue/sweep split as
 * M7's `NotificationDispatchService`, deliberately simpler: there is no
 * channel-fallback chain here (each provider instance is independent, not
 * a fallback order), so a failure just retries in place up to
 * `MAX_ATTEMPTS` on the next sweep tick rather than scheduling a specific
 * backoff delay — tracking delivery is best-effort, not "the customer is
 * waiting for this," and the embedded sweep's own 60s cadence already
 * spaces retries out.
 */
@Injectable()
export class TrackingDispatchService {
  private readonly logger = new Logger(TrackingDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly drivers: TrackingDriversService,
  ) {}

  async runSweep(): Promise<{ processed: number }> {
    const due = await this.prisma.trackingEventLog.findMany({ where: { status: "queued" }, orderBy: { createdAt: "asc" }, take: BATCH_SIZE });
    for (const log of due) {
      await this.attempt(log);
    }
    return { processed: due.length };
  }

  private async attempt(log: { id: string; providerInstanceId: string | null; payload: unknown; attempts: number }): Promise<void> {
    if (!log.providerInstanceId) {
      await this.prisma.trackingEventLog.update({ where: { id: log.id }, data: { status: "failed", lastError: "No provider instance recorded for this log row" } });
      return;
    }
    try {
      const driver = await this.drivers.resolve(log.providerInstanceId);
      await driver.send(log.payload as TrackingEventInput);
      await this.prisma.trackingEventLog.update({ where: { id: log.id }, data: { status: "sent" } });
    } catch (error) {
      const attempts = log.attempts + 1;
      const message = error instanceof Error ? error.message : "Unknown error";
      if (attempts >= MAX_ATTEMPTS) {
        await this.prisma.trackingEventLog.update({ where: { id: log.id }, data: { status: "failed", attempts, lastError: message } });
        this.logger.warn(`Tracking event ${log.id} failed permanently after ${attempts} attempts: ${message}`);
      } else {
        await this.prisma.trackingEventLog.update({ where: { id: log.id }, data: { attempts, lastError: message } });
      }
    }
  }
}
