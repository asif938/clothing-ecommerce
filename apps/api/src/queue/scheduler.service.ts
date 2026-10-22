import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import type { Env } from "../config/env.schema";

const EMBEDDED_TICK_INTERVAL_MS = 60_000;

export type ScheduledTaskHandler = (payload: unknown) => Promise<void>;

/**
 * `scheduled_tasks` (docs/PROJECT_SPEC.md §5.1) — admin-visible schedules,
 * ticked either by an embedded interval (`WORKER_MODE=embedded`, the
 * free-tier default) or by an external cron hitting
 * `POST /public/cron/:task` with `CRON_SECRET` (free-tier platforms that
 * spin down idle processes and can't run a persistent `setInterval`).
 * No task `type` has a handler registered yet in Milestone 1 — a due task
 * with no matching handler fails loudly (`lastError`) rather than being
 * silently dropped, so a future milestone that forgets to register one
 * notices immediately.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly handlers = new Map<string, ScheduledTaskHandler>();
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    if (this.config.get("WORKER_MODE", { infer: true }) !== "embedded") return;
    this.intervalHandle = setInterval(() => {
      this.runDueTasks().catch((error) => this.logger.error(error));
    }, EMBEDDED_TICK_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  registerHandler(type: string, handler: ScheduledTaskHandler): void {
    this.handlers.set(type, handler);
  }

  async runDueTasks(): Promise<{ processed: number }> {
    const due = await this.prisma.scheduledTask.findMany({
      where: { status: "pending", runAt: { lte: new Date() } },
      take: 50,
    });

    let processed = 0;
    for (const task of due) {
      await this.prisma.scheduledTask.update({ where: { id: task.id }, data: { status: "running" } });
      const handler = this.handlers.get(task.type);
      try {
        if (!handler) throw new Error(`No handler registered for scheduled task type "${task.type}"`);
        await handler(task.payload);
        await this.prisma.scheduledTask.update({ where: { id: task.id }, data: { status: "done" } });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        this.logger.error(`Scheduled task ${task.id} (${task.type}) failed: ${message}`);
        await this.prisma.scheduledTask.update({ where: { id: task.id }, data: { status: "failed", lastError: message } });
      }
      processed += 1;
    }
    return { processed };
  }
}
