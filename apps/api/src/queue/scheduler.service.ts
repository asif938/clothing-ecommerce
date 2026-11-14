import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import type { Env } from "../config/env.schema";

const EMBEDDED_TICK_INTERVAL_MS = 60_000;
/**
 * A task still `running` this long after it was claimed is treated as abandoned — its handler hung
 * (e.g. the database connection dropped mid-query) or the process died. Far above any handler's
 * normal run time (an import chunk takes a minute or two).
 */
export const STALE_TASK_AFTER_MS = 15 * 60_000;
/** Marks a task that has already been requeued once after going stale; going stale again fails it. */
export const STALE_REQUEUE_MARKER = "Requeued after going stale";

export type ScheduledTaskHandler = (payload: unknown) => Promise<void>;
export type RecurringTaskHandler = () => Promise<void>;

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
  // Handlers with no `scheduled_tasks` row of their own — cheap, idempotent
  // sweeps (e.g. "flip scheduled products live", "apply/revert price
  // schedules") that just need to run on every tick, embedded or external
  // cron alike, rather than tracking a job per run.
  private readonly recurringHandlers = new Map<string, RecurringTaskHandler>();
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

  registerRecurring(type: string, handler: RecurringTaskHandler): void {
    this.recurringHandlers.set(type, handler);
  }

  async runDueTasks(): Promise<{ processed: number }> {
    for (const [type, handler] of this.recurringHandlers) {
      try {
        await handler();
      } catch (error) {
        this.logger.error(`Recurring task "${type}" failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    await this.recoverStaleTasks();

    const due = await this.prisma.scheduledTask.findMany({
      where: { status: "pending", runAt: { lte: new Date() } },
      take: 50,
    });

    let processed = 0;
    for (const task of due) {
      // Atomic claim: ticks can overlap (a slow or hung tick doesn't stop the interval, and an
      // external cron may fire alongside), so only the tick that flips pending → running runs it.
      // `claimedAt` is stamped into `updatedAt` so completion can tell whether it still owns the task.
      const claimedAt = new Date();
      const claim = await this.prisma.scheduledTask.updateMany({ where: { id: task.id, status: "pending" }, data: { status: "running", updatedAt: claimedAt } });
      if (claim.count === 0) continue;

      const handler = this.handlers.get(task.type);
      let outcome: { status: "done" } | { status: "failed"; lastError: string };
      try {
        if (!handler) throw new Error(`No handler registered for scheduled task type "${task.type}"`);
        await handler(task.payload);
        outcome = { status: "done" };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        this.logger.error(`Scheduled task ${task.id} (${task.type}) failed: ${message}`);
        outcome = { status: "failed", lastError: message };
      }
      // Only if nothing reclaimed the task while its handler ran (see recoverStaleTasks).
      const finished = await this.prisma.scheduledTask.updateMany({ where: { id: task.id, status: "running", updatedAt: claimedAt }, data: outcome });
      if (finished.count === 0) this.logger.warn(`Scheduled task ${task.id} (${task.type}) finished after it had been reclaimed as stale; result not recorded`);
      processed += 1;
    }
    return { processed };
  }

  /**
   * A handler that never returns (a dropped database connection, a crashed process) used to leave its
   * task `running` forever, silently stalling whatever chain it belonged to (e.g. the last chunk of a
   * catalog import). Stale tasks are requeued once; one that goes stale again is failed, so a handler
   * that reliably hangs can't loop forever.
   */
  private async recoverStaleTasks(): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_TASK_AFTER_MS);
    const stale = await this.prisma.scheduledTask.findMany({ where: { status: "running", updatedAt: { lt: staleBefore } }, select: { id: true, type: true, lastError: true, updatedAt: true }, take: 50 });
    for (const task of stale) {
      const alreadyRequeued = task.lastError?.startsWith(STALE_REQUEUE_MARKER) ?? false;
      const data = alreadyRequeued
        ? { status: "failed" as const, lastError: `Gave up: still running ${Math.round(STALE_TASK_AFTER_MS / 60_000)} minutes after being requeued` }
        : { status: "pending" as const, runAt: new Date(), lastError: `${STALE_REQUEUE_MARKER} (no result ${Math.round(STALE_TASK_AFTER_MS / 60_000)} minutes after it started)` };
      // Conditional on the same `updatedAt`, so two overlapping ticks can't both act on one task.
      const result = await this.prisma.scheduledTask.updateMany({ where: { id: task.id, status: "running", updatedAt: task.updatedAt }, data });
      if (result.count > 0) this.logger.warn(`Scheduled task ${task.id} (${task.type}) was stale — ${alreadyRequeued ? "marked failed" : "requeued"}`);
    }
  }
}
