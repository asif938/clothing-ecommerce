import { afterEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@clothing/shared/crypto";
import { OtpService } from "./otp.service";

const SETTINGS: Record<string, number> = {
  "auth.otpLength": 6,
  "auth.otpTtlMinutes": 5,
  "auth.otpResendSeconds": 60,
  "auth.otpMaxSendsPerPhonePer10Min": 3,
  "auth.otpMaxSendsPerIpPer10Min": 10,
  "auth.otpMaxAttempts": 5,
};

function makeService(opts: { driverName?: string; phoneCount?: number; ipCount?: number; otp?: Record<string, unknown> | null; claimCount?: number; consumeCount?: number } = {}) {
  const send = vi.fn(() => Promise.resolve());
  const prisma = {
    otpCode: {
      findFirst: vi.fn(() => Promise.resolve(opts.otp ?? null)),
      count: vi.fn((args: { where: { phone?: string; ip?: string } }) => Promise.resolve(args.where.ip ? (opts.ipCount ?? 0) : (opts.phoneCount ?? 0))),
      create: vi.fn(),
      updateMany: vi
        .fn()
        .mockResolvedValueOnce({ count: opts.claimCount ?? 1 })
        .mockResolvedValue({ count: opts.consumeCount ?? 1 }),
    },
  };
  const settings = { getValue: vi.fn((key: string) => Promise.resolve(SETTINGS[key])) };
  const drivers = { resolveSms: vi.fn(() => Promise.resolve({ driver: { send }, driverName: opts.driverName ?? "mock", instanceId: null })) };
  const notifications = { renderOtpMessage: vi.fn(() => Promise.resolve({ body: "code" })), logImmediate: vi.fn() };
  const service = new OtpService(prisma as never, settings as never, drivers as never, notifications as never);
  return { service, prisma, send };
}

describe("OtpService.send", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses once one IP has asked for too many codes, whatever the phone number", async () => {
    const { service, send } = makeService({ ipCount: 10 });
    await expect(service.send("+8801700000001", "login", "203.0.113.9")).rejects.toMatchObject({ response: { code: "OTP_RATE_LIMITED" } });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends through the real gateway and never echoes the code once one is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { service, send } = makeService({ driverName: "sslwireless" });
    const result = await service.send("+8801700000001", "login", "203.0.113.9");
    expect(send).toHaveBeenCalled();
    expect(result.devCode).toBeUndefined();
  });

  it("echoes the code only for the mock driver outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const dev = await makeService({ driverName: "mock" }).service.send("+8801700000001", "login", null);
    expect(dev.devCode).toMatch(/^\d{6}$/);
    vi.stubEnv("NODE_ENV", "production");
    const prod = await makeService({ driverName: "mock" }).service.send("+8801700000001", "login", null);
    expect(prod.devCode).toBeUndefined();
  });
});

describe("OtpService.verify", () => {
  const otpRow = async (code = "123456") => ({ id: "otp1", codeHash: await hashPassword(code), attempts: 0, consumedAt: null });

  it("takes an attempt atomically before comparing the code", async () => {
    const { service, prisma } = makeService({ otp: await otpRow() });
    expect(await service.verify("+8801700000001", "login", "000000")).toBe(false);
    expect(prisma.otpCode.updateMany).toHaveBeenCalledWith({ where: { id: "otp1", consumedAt: null, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
  });

  it("refuses when no attempt is left to take (parallel guesses can't exceed the limit)", async () => {
    const { service } = makeService({ otp: await otpRow(), claimCount: 0 });
    await expect(service.verify("+8801700000001", "login", "123456")).rejects.toMatchObject({ response: { code: "OTP_MAX_ATTEMPTS" } });
  });

  it("accepts the right code once", async () => {
    expect(await makeService({ otp: await otpRow() }).service.verify("+8801700000001", "login", "123456")).toBe(true);
    expect(await makeService({ otp: await otpRow(), consumeCount: 0 }).service.verify("+8801700000001", "login", "123456")).toBe(false);
  });
});
