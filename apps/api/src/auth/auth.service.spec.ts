import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

function makeService(totpEnabled: boolean) {
  const prisma = {
    staffUser: {
      findUniqueOrThrow: vi.fn(() => Promise.resolve({ id: "s1", email: "owner@example.com", totpEnabled, totpSecret: "OLDSECRET" })),
      update: vi.fn(),
    },
  };
  const settings = { getValue: vi.fn(() => Promise.resolve({ bn: "দোকান", en: "Shop" })) };
  const service = new AuthService(prisma as never, {} as never, {} as never, { record: vi.fn() } as never, settings as never);
  return { service, prisma };
}

describe("AuthService.setupTotp", () => {
  it("refuses to replace the secret (and switch 2FA off) once 2FA is on", async () => {
    const { service, prisma } = makeService(true);
    await expect(service.setupTotp("s1")).rejects.toMatchObject({ response: { code: "TOTP_ALREADY_ENABLED" } });
    expect(prisma.staffUser.update).not.toHaveBeenCalled();
  });

  it("issues a new secret while 2FA is still off", async () => {
    const { service, prisma } = makeService(false);
    const setup = await service.setupTotp("s1");
    expect(prisma.staffUser.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: expect.objectContaining({ totpEnabled: false }) });
    expect(setup).toBeTruthy();
  });
});

describe("AuthService.loginTotp", () => {
  function make(user: Record<string, unknown>) {
    const prisma = {
      staffUser: { findUniqueOrThrow: vi.fn(() => Promise.resolve(user)), update: vi.fn() },
    };
    const settings = { getValue: vi.fn((key: string) => Promise.resolve(key === "security.loginMaxAttempts" ? 5 : 15)) };
    const pending = { consume: vi.fn(() => "s1") };
    const service = new AuthService(prisma as never, {} as never, pending as never, { record: vi.fn() } as never, settings as never);
    return { service, prisma };
  }
  const base = { id: "s1", status: "active", deletedAt: null, lockedUntil: null, failedLoginAttempts: 0, totpSecret: "JBSWY3DPEHPK3PXP" };

  it("counts a wrong 2FA code as a failed login", async () => {
    const { service, prisma } = make(base);
    await expect(service.loginTotp("t", "000000", { ip: null, userAgent: null })).rejects.toMatchObject({ response: { code: "INVALID_TOTP" } });
    expect(prisma.staffUser.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { failedLoginAttempts: 1, lockedUntil: null } });
  });

  it("refuses while the account is locked, without checking the code", async () => {
    const { service } = make({ ...base, lockedUntil: new Date(Date.now() + 60_000) });
    await expect(service.loginTotp("t", "000000", { ip: null, userAgent: null })).rejects.toMatchObject({ response: { code: "ACCOUNT_LOCKED" } });
  });
});
