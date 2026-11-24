import { Injectable } from "@nestjs/common";
import { createMockCaptchaDriver, createTurnstileDriver, mockCaptchaConfigSchema, turnstileConfigSchema, type CaptchaDriver } from "@clothing/shared/providers";
import { ProviderRegistryService } from "../providers/provider-registry.service";

/** Resolves the active "captcha" driver (golden rule 2) — Turnstile when configured, otherwise the mock (always succeeds unless configured to simulate failure). */
@Injectable()
export class CaptchaProvidersService {
  constructor(private readonly registry: ProviderRegistryService) {}

  /**
   * What the storefront needs to render the widget: which provider, and Turnstile's public site key. The secret key
   * never leaves the API. A Turnstile instance with a broken config reports no site key (the checkout then shows an error).
   */
  async publicConfig(): Promise<{ provider: "turnstile" | "mock"; siteKey: string | null }> {
    const active = await this.registry.findActiveInstance("captcha");
    if (active?.driver === "turnstile") {
      const parsed = turnstileConfigSchema.safeParse(active.config);
      return { provider: "turnstile", siteKey: parsed.success ? parsed.data.siteKey : null };
    }
    return { provider: "mock", siteKey: null };
  }

  async resolveActiveDriver(): Promise<CaptchaDriver> {
    const active = await this.registry.findActiveInstance("captcha");
    if (active?.driver === "turnstile") {
      return createTurnstileDriver(turnstileConfigSchema.parse(active.config));
    }
    return createMockCaptchaDriver(mockCaptchaConfigSchema.parse(active?.driver === "mock" ? active.config : {}));
  }
}
