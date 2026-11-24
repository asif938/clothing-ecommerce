import { describe, expect, it, vi } from "vitest";
import { CaptchaProvidersService } from "./captcha-providers.service";
import { CheckoutController } from "./checkout.controller";

function registry(active: { driver: string; config: unknown } | null) {
  return { findActiveInstance: vi.fn(() => Promise.resolve(active)) };
}

describe("CaptchaProvidersService.publicConfig", () => {
  it("exposes only the Turnstile site key, never the secret", async () => {
    const service = new CaptchaProvidersService(registry({ driver: "turnstile", config: { siteKey: "0xSITE", secretKey: "0xSECRET" } }) as never);
    const config = await service.publicConfig();
    expect(config).toEqual({ provider: "turnstile", siteKey: "0xSITE" });
    expect(JSON.stringify(config)).not.toContain("0xSECRET");
  });

  it("reports the mock provider when no Turnstile instance is active", async () => {
    expect(await new CaptchaProvidersService(registry(null) as never).publicConfig()).toEqual({ provider: "mock", siteKey: null });
  });
});

describe("CheckoutController.captchaConfig", () => {
  it("says captcha is off when the setting is off", async () => {
    const controller = new CheckoutController({} as never, { publicConfig: vi.fn() } as never, { getValue: vi.fn(() => Promise.resolve(false)) } as never);
    expect(await controller.captchaConfig()).toEqual({ enabled: false, provider: null, siteKey: null });
  });

  it("returns the provider and site key when the setting is on", async () => {
    const controller = new CheckoutController({} as never, { publicConfig: vi.fn(() => Promise.resolve({ provider: "turnstile", siteKey: "0xSITE" })) } as never, { getValue: vi.fn(() => Promise.resolve(true)) } as never);
    expect(await controller.captchaConfig()).toEqual({ enabled: true, provider: "turnstile", siteKey: "0xSITE" });
  });
});
