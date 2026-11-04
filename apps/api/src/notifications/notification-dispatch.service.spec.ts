import { describe, expect, it, vi } from "vitest";
import { NotificationDispatchService } from "./notification-dispatch.service";

function baseLog(overrides: Record<string, unknown> = {}) {
  return {
    id: "log-1",
    event: "order_confirmed",
    channel: "sms",
    to: "+8801700000000",
    subject: null,
    body: "hi",
    attempts: 0,
    maxAttempts: 5,
    fallbackIndex: 0,
    recipientType: "customer",
    recipientId: "c1",
    locale: "bn",
    contacts: { sms: "+8801700000000" },
    variables: {},
    relatedEntityType: "order",
    relatedEntityId: "o1",
    ...overrides,
  };
}

function makeService(log: ReturnType<typeof baseLog>, sendImpl: () => Promise<{ driverName: string; instanceId: string | null }>) {
  const prisma = {
    notificationLog: {
      findMany: vi.fn(() => Promise.resolve([log])),
      update: vi.fn((_args: { where: { id: string }; data: Record<string, unknown> }) => Promise.resolve({})),
    },
    orderEvent: { create: vi.fn(() => Promise.resolve({})) },
  };
  const drivers = { send: vi.fn(sendImpl) };
  const notifications = { createFallbackLog: vi.fn(() => Promise.resolve(true)) };
  const service = new NotificationDispatchService(prisma as never, drivers as never, notifications as never);
  return { service, prisma, drivers, notifications };
}

describe("NotificationDispatchService.runSweep", () => {
  it("marks a log sent and writes an order timeline event on success", async () => {
    const log = baseLog();
    const { service, prisma } = makeService(log, () => Promise.resolve({ driverName: "mock", instanceId: null }));
    await service.runSweep();
    expect(prisma.notificationLog.update).toHaveBeenCalledWith({ where: { id: "log-1" }, data: expect.objectContaining({ status: "sent", driver: "mock" }) });
    expect(prisma.orderEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ orderId: "o1", type: "notification_sent" }) });
  });

  it("schedules a backoff retry when attempts remain", async () => {
    const log = baseLog({ attempts: 1, maxAttempts: 5 });
    const { service, prisma, notifications } = makeService(log, () => Promise.reject(new Error("network down")));
    await service.runSweep();
    const call = prisma.notificationLog.update.mock.calls[0]![0];
    expect(call.data.status).toBe("retrying");
    expect(call.data.attempts).toBe(2);
    expect((call.data.nextAttemptAt as Date).getTime()).toBeGreaterThan(Date.now());
    expect(notifications.createFallbackLog).not.toHaveBeenCalled();
  });

  it("marks the channel failed and falls back to the next channel once attempts are exhausted", async () => {
    const log = baseLog({ attempts: 4, maxAttempts: 5 });
    const { service, prisma, notifications } = makeService(log, () => Promise.reject(new Error("gateway rejected")));
    await service.runSweep();
    expect(prisma.notificationLog.update).toHaveBeenCalledWith({ where: { id: "log-1" }, data: expect.objectContaining({ status: "failed", attempts: 5, lastError: "gateway rejected" }) });
    expect(notifications.createFallbackLog).toHaveBeenCalledWith(log);
  });

  it("does not write an order timeline event for a notification with no related order", async () => {
    const log = baseLog({ relatedEntityType: null, relatedEntityId: null });
    const { service, prisma } = makeService(log, () => Promise.resolve({ driverName: "mock", instanceId: null }));
    await service.runSweep();
    expect(prisma.orderEvent.create).not.toHaveBeenCalled();
  });
});
