import { describe, expect, it, vi } from "vitest";
import { PaymentsService } from "./payments.service";

type VerifyResult = { status: "succeeded" | "failed" | "pending"; externalRef: string; amount?: number };

function makeService(opts: { instance?: { id: string; driver: string; config: unknown } | null; claimCount?: number; payment?: Record<string, unknown> | null; simulate?: "success" | "failure" | "pending" } = {}) {
  const payment = opts.payment === undefined ? { id: "p1", orderId: "o1", method: "mock", purpose: "full", amount: 100000, status: "pending", providerInstanceId: "pi1" } : opts.payment;
  const instance = opts.instance === undefined ? { id: "pi1", driver: "mock", config: { simulate: opts.simulate ?? "success" } } : opts.instance;
  const prisma = {
    payment: {
      findFirst: vi.fn(() => Promise.resolve(payment)),
      updateMany: vi.fn(() => Promise.resolve({ count: opts.claimCount ?? 1 })),
      create: vi.fn(() => Promise.resolve({ id: "p-new" })),
      update: vi.fn(),
    },
    providerInstance: {
      findFirst: vi.fn(() => Promise.resolve(instance)),
      findUnique: vi.fn(() => Promise.resolve(instance)),
      findMany: vi.fn(() => Promise.resolve(instance ? [{ ...instance, enabled: true }] : [])),
    },
  };
  const settings = { getValue: vi.fn(() => Promise.resolve(true)) };
  const registry = { decryptConfig: vi.fn((c: unknown) => c) };
  const lifecycle = { onPaymentSucceeded: vi.fn(), onPaymentFailed: vi.fn(), onPaymentAmountMismatch: vi.fn() };
  const config = { get: vi.fn(() => "http://api.test") };
  const service = new PaymentsService(prisma as never, settings as never, registry as never, lifecycle as never, config as never);
  return { service, prisma, lifecycle };
}

describe("PaymentsService", () => {
  it("refuses the mock gateway when no mock provider instance is enabled (no silent fallback)", async () => {
    const { service } = makeService({ instance: null });
    await expect(
      service.initiate("o1", "mock", "full", 100000, { success: "s", fail: "f", cancel: "c" }, {}, "DEM1"),
    ).rejects.toMatchObject({ response: { code: "PAYMENT_METHOD_NOT_CONFIGURED" } });
  });

  it("does not list mock as available unless an instance is enabled", async () => {
    const { service } = makeService({ instance: null });
    expect(await service.availableMethods()).toEqual(["cod"]);
  });

  it("credits the order once when the claim wins", async () => {
    const { service, prisma, lifecycle } = makeService();
    await service.confirmByExternalRef("mock", "ref1");
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", status: { in: ["initiated", "pending"] } }, data: expect.objectContaining({ status: "succeeded" }) }));
    expect(lifecycle.onPaymentSucceeded).toHaveBeenCalledWith("o1", "full", 100000, "p1");
  });

  it("does nothing when a concurrent callback already settled the payment", async () => {
    const { service, lifecycle } = makeService({ claimCount: 0 });
    await service.confirmByExternalRef("mock", "ref1");
    expect(lifecycle.onPaymentSucceeded).not.toHaveBeenCalled();
  });

  it("never credits an order when the gateway confirms a different amount", async () => {
    const { service, prisma, lifecycle } = makeService();
    const verify = vi.fn((): Promise<VerifyResult> => Promise.resolve({ status: "succeeded", externalRef: "ref1", amount: 1000 }));
    vi.spyOn(service as never as { resolveDriver: () => Promise<unknown> }, "resolveDriver").mockResolvedValue({ driver: { verify, initiate: vi.fn() }, providerInstanceId: "pi1" });

    await service.confirmByExternalRef("bkash", "ref1");

    expect(prisma.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }));
    expect(lifecycle.onPaymentSucceeded).not.toHaveBeenCalled();
    expect(lifecycle.onPaymentAmountMismatch).toHaveBeenCalledWith("o1", "p1", 100000, 1000);
  });
});
