import { describe, expect, it, vi } from "vitest";
import { SchedulerService } from "./scheduler.service";

function makePrismaMock(tasks: { id: string; type: string; payload: unknown }[]) {
  const updates: { id: string; data: unknown }[] = [];
  return {
    scheduledTask: {
      findMany: vi.fn(() => Promise.resolve(tasks)),
      update: vi.fn(({ where, data }: { where: { id: string }; data: unknown }) => {
        updates.push({ id: where.id, data });
        return Promise.resolve({});
      }),
    },
    __updates: updates,
  };
}

function makeConfig(workerMode: "embedded" | "separate" = "separate") {
  return { get: vi.fn(() => workerMode) };
}

describe("SchedulerService", () => {
  it("does nothing when there are no due tasks", async () => {
    const prisma = makePrismaMock([]);
    const scheduler = new SchedulerService(prisma as never, makeConfig() as never);
    expect(await scheduler.runDueTasks()).toEqual({ processed: 0 });
  });

  it("marks a task done when its registered handler succeeds", async () => {
    const prisma = makePrismaMock([{ id: "t1", type: "ping", payload: null }]);
    const scheduler = new SchedulerService(prisma as never, makeConfig() as never);
    const handler = vi.fn().mockResolvedValue(undefined);
    scheduler.registerHandler("ping", handler);

    const result = await scheduler.runDueTasks();

    expect(result).toEqual({ processed: 1 });
    expect(handler).toHaveBeenCalledOnce();
    expect(prisma.__updates.at(-1)).toEqual({ id: "t1", data: { status: "done" } });
  });

  it("marks a task failed, with the error message, when no handler is registered", async () => {
    const prisma = makePrismaMock([{ id: "t2", type: "unregistered", payload: null }]);
    const scheduler = new SchedulerService(prisma as never, makeConfig() as never);

    await scheduler.runDueTasks();

    expect(prisma.__updates.at(-1)).toMatchObject({
      id: "t2",
      data: { status: "failed", lastError: expect.stringContaining("No handler registered") },
    });
  });

  it("marks a task failed when its handler throws", async () => {
    const prisma = makePrismaMock([{ id: "t3", type: "boom", payload: null }]);
    const scheduler = new SchedulerService(prisma as never, makeConfig() as never);
    scheduler.registerHandler("boom", async () => {
      throw new Error("kaboom");
    });

    await scheduler.runDueTasks();

    expect(prisma.__updates.at(-1)).toEqual({ id: "t3", data: { status: "failed", lastError: "kaboom" } });
  });

  it("does not start an embedded ticker when WORKER_MODE is not embedded", () => {
    const prisma = makePrismaMock([]);
    const scheduler = new SchedulerService(prisma as never, makeConfig("separate") as never);
    scheduler.onModuleInit();
    scheduler.onModuleDestroy(); // should not throw even if no interval was started
  });
});
