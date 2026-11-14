import { describe, expect, it, vi } from "vitest";
import { SchedulerService, STALE_REQUEUE_MARKER, STALE_TASK_AFTER_MS } from "./scheduler.service";

interface TaskRow {
  id: string;
  type: string;
  payload: unknown;
  status: "pending" | "running" | "done" | "failed";
  runAt: Date;
  updatedAt: Date;
  lastError: string | null;
}

/** In-memory `scheduled_tasks` honouring the conditional `updateMany` filters the scheduler relies on. */
function makePrismaMock(seed: Partial<TaskRow>[]) {
  const tasks: TaskRow[] = seed.map((t, i) => ({ id: `t${i + 1}`, type: "ping", payload: null, status: "pending", runAt: new Date(0), updatedAt: new Date(0), lastError: null, ...t }));
  const matches = (task: TaskRow, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => {
      if (key === "updatedAt" && value && typeof value === "object" && "lt" in value) return task.updatedAt < (value as { lt: Date }).lt;
      if (key === "runAt" && value && typeof value === "object" && "lte" in value) return task.runAt <= (value as { lte: Date }).lte;
      if (value instanceof Date) return (task[key as keyof TaskRow] as Date).getTime() === value.getTime();
      return task[key as keyof TaskRow] === value;
    });
  return {
    tasks,
    scheduledTask: {
      findMany: vi.fn(({ where }: { where: Record<string, unknown> }) => Promise.resolve(tasks.filter((t) => matches(t, where)).map((t) => ({ ...t })))),
      updateMany: vi.fn(({ where, data }: { where: Record<string, unknown>; data: Partial<TaskRow> }) => {
        const hit = tasks.filter((t) => matches(t, where));
        for (const t of hit) Object.assign(t, { updatedAt: new Date(), ...data });
        return Promise.resolve({ count: hit.length });
      }),
    },
  };
}

function makeConfig(workerMode: "embedded" | "separate" = "separate") {
  return { get: vi.fn(() => workerMode) };
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

describe("SchedulerService", () => {
  it("does nothing when there are no due tasks", async () => {
    const prisma = makePrismaMock([]);
    const scheduler = new SchedulerService(prisma as never, makeConfig() as never);
    expect(await scheduler.runDueTasks()).toEqual({ processed: 0 });
  });

  it("marks a task done when its registered handler succeeds", async () => {
    const prisma = makePrismaMock([{ type: "ping" }]);
    const scheduler = new SchedulerService(prisma as never, makeConfig() as never);
    const handler = vi.fn().mockResolvedValue(undefined);
    scheduler.registerHandler("ping", handler);

    expect(await scheduler.runDueTasks()).toEqual({ processed: 1 });
    expect(handler).toHaveBeenCalledOnce();
    expect(prisma.tasks[0]!.status).toBe("done");
  });

  it("marks a task failed, with the error message, when no handler is registered", async () => {
    const prisma = makePrismaMock([{ type: "unregistered" }]);
    const scheduler = new SchedulerService(prisma as never, makeConfig() as never);
    await scheduler.runDueTasks();
    expect(prisma.tasks[0]).toMatchObject({ status: "failed", lastError: expect.stringContaining("No handler registered") });
  });

  it("marks a task failed when its handler throws", async () => {
    const prisma = makePrismaMock([{ type: "boom" }]);
    const scheduler = new SchedulerService(prisma as never, makeConfig() as never);
    scheduler.registerHandler("boom", async () => {
      throw new Error("kaboom");
    });
    await scheduler.runDueTasks();
    expect(prisma.tasks[0]).toMatchObject({ status: "failed", lastError: "kaboom" });
  });

  it("runs every registered recurring handler on each tick, independent of scheduled_tasks rows", async () => {
    const prisma = makePrismaMock([]);
    const scheduler = new SchedulerService(prisma as never, makeConfig() as never);
    const sweep = vi.fn().mockResolvedValue(undefined);
    scheduler.registerRecurring("product.publish_sweep", sweep);
    await scheduler.runDueTasks();
    await scheduler.runDueTasks();
    expect(sweep).toHaveBeenCalledTimes(2);
  });

  it("logs and continues when a recurring handler throws, without affecting scheduled_tasks processing", async () => {
    const prisma = makePrismaMock([{ type: "ping" }]);
    const scheduler = new SchedulerService(prisma as never, makeConfig() as never);
    scheduler.registerRecurring("broken_sweep", async () => {
      throw new Error("sweep failed");
    });
    const handler = vi.fn().mockResolvedValue(undefined);
    scheduler.registerHandler("ping", handler);
    expect(await scheduler.runDueTasks()).toEqual({ processed: 1 });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("never runs one task twice when two ticks overlap", async () => {
    const prisma = makePrismaMock([{ type: "slow" }]);
    const scheduler = new SchedulerService(prisma as never, makeConfig() as never);
    let release!: () => void;
    const handler = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    scheduler.registerHandler("slow", handler);

    const first = scheduler.runDueTasks();
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    // A second tick fires while the first is still inside the handler.
    expect(await scheduler.runDueTasks()).toEqual({ processed: 0 });
    release();
    await first;
    expect(handler).toHaveBeenCalledOnce();
    expect(prisma.tasks[0]!.status).toBe("done");
  });

  it("requeues a task left running past the stale threshold, then runs it", async () => {
    const prisma = makePrismaMock([{ type: "ping", status: "running", updatedAt: minutesAgo(STALE_TASK_AFTER_MS / 60_000 + 1) }]);
    const scheduler = new SchedulerService(prisma as never, makeConfig() as never);
    const handler = vi.fn().mockResolvedValue(undefined);
    scheduler.registerHandler("ping", handler);

    expect(await scheduler.runDueTasks()).toEqual({ processed: 1 });
    expect(handler).toHaveBeenCalledOnce();
    expect(prisma.tasks[0]).toMatchObject({ status: "done", lastError: expect.stringContaining(STALE_REQUEUE_MARKER) });
  });

  it("leaves a recently claimed running task alone", async () => {
    const prisma = makePrismaMock([{ type: "ping", status: "running", updatedAt: minutesAgo(2) }]);
    const scheduler = new SchedulerService(prisma as never, makeConfig() as never);
    const handler = vi.fn();
    scheduler.registerHandler("ping", handler);
    await scheduler.runDueTasks();
    expect(handler).not.toHaveBeenCalled();
    expect(prisma.tasks[0]!.status).toBe("running");
  });

  it("fails a task that goes stale a second time instead of requeueing it forever", async () => {
    const prisma = makePrismaMock([{ type: "ping", status: "running", updatedAt: minutesAgo(60), lastError: `${STALE_REQUEUE_MARKER} (…)` }]);
    const scheduler = new SchedulerService(prisma as never, makeConfig() as never);
    const handler = vi.fn();
    scheduler.registerHandler("ping", handler);
    await scheduler.runDueTasks();
    expect(handler).not.toHaveBeenCalled();
    expect(prisma.tasks[0]).toMatchObject({ status: "failed", lastError: expect.stringMatching(/^Gave up/) });
  });

  it("does not overwrite the outcome of a re-run when the original hung handler finishes late", async () => {
    const prisma = makePrismaMock([{ type: "slow" }]);
    const scheduler = new SchedulerService(prisma as never, makeConfig() as never);
    let releaseFirst!: () => void;
    const handler = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (releaseFirst = resolve)))
      .mockImplementationOnce(() => Promise.reject(new Error("second run failed")));
    scheduler.registerHandler("slow", handler);

    const hung = scheduler.runDueTasks();
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    // Time passes: the claim goes stale and a later tick requeues and re-runs it.
    prisma.tasks[0]!.updatedAt = minutesAgo(60);
    await scheduler.runDueTasks();
    expect(prisma.tasks[0]).toMatchObject({ status: "failed", lastError: "second run failed" });

    releaseFirst();
    await hung;
    expect(prisma.tasks[0]).toMatchObject({ status: "failed", lastError: "second run failed" });
  });

  it("does not start an embedded ticker when WORKER_MODE is not embedded", () => {
    const prisma = makePrismaMock([]);
    const scheduler = new SchedulerService(prisma as never, makeConfig("separate") as never);
    scheduler.onModuleInit();
    scheduler.onModuleDestroy(); // should not throw even if no interval was started
  });
});
