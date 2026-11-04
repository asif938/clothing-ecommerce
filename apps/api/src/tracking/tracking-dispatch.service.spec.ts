import { describe, expect, it, vi } from "vitest";
import { TrackingDispatchService } from "./tracking-dispatch.service";

function baseLog(overrides: Record<string, unknown> = {}) {
  return {
    id: "log-1",
    providerInstanceId: "inst-1",
    payload: { eventName: "Purchase", eventId: "evt-1", eventTimeUnixSeconds: 0, userData: {} },
    attempts: 0,
    ...overrides,
  };
}

function makeService(log: ReturnType<typeof baseLog>, sendImpl: () => Promise<void>) {
  const prisma = {
    trackingEventLog: {
      findMany: vi.fn(() => Promise.resolve([log])),
      update: vi.fn((_args: { where: { id: string }; data: Record<string, unknown> }) => Promise.resolve({})),
    },
  };
  const driver = { send: vi.fn(sendImpl) };
  const drivers = { resolve: vi.fn(() => Promise.resolve(driver)) };
  const service = new TrackingDispatchService(prisma as never, drivers as never);
  return { service, prisma, drivers };
}

describe("TrackingDispatchService.runSweep", () => {
  it("marks a log sent on success", async () => {
    const log = baseLog();
    const { service, prisma } = makeService(log, () => Promise.resolve());
    await service.runSweep();
    expect(prisma.trackingEventLog.update).toHaveBeenCalledWith({ where: { id: "log-1" }, data: { status: "sent" } });
  });

  it("increments attempts and stays queued when attempts remain", async () => {
    const log = baseLog({ attempts: 1 });
    const { service, prisma } = makeService(log, () => Promise.reject(new Error("network down")));
    await service.runSweep();
    expect(prisma.trackingEventLog.update).toHaveBeenCalledWith({ where: { id: "log-1" }, data: { attempts: 2, lastError: "network down" } });
  });

  it("marks failed once max attempts are exhausted", async () => {
    const log = baseLog({ attempts: 4 });
    const { service, prisma } = makeService(log, () => Promise.reject(new Error("gateway rejected")));
    await service.runSweep();
    expect(prisma.trackingEventLog.update).toHaveBeenCalledWith({ where: { id: "log-1" }, data: { status: "failed", attempts: 5, lastError: "gateway rejected" } });
  });

  it("fails immediately when the log has no provider instance recorded", async () => {
    const log = baseLog({ providerInstanceId: null });
    const { service, prisma, drivers } = makeService(log, () => Promise.resolve());
    await service.runSweep();
    expect(drivers.resolve).not.toHaveBeenCalled();
    expect(prisma.trackingEventLog.update).toHaveBeenCalledWith({ where: { id: "log-1" }, data: { status: "failed", lastError: "No provider instance recorded for this log row" } });
  });
});
