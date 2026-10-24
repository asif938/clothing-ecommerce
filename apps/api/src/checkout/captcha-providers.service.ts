import { Injectable } from "@nestjs/common";
import { createMockCaptchaDriver, createTurnstileDriver, mockCaptchaConfigSchema, turnstileConfigSchema, type CaptchaDriver } from "@clothing/shared/providers";
import { ProviderRegistryService } from "../providers/provider-registry.service";

/** Resolves the active "captcha" driver (golden rule 2) — Turnstile when configured, otherwise the mock (always succeeds unless configured to simulate failure). */
@Injectable()
export class CaptchaProvidersService {
  constructor(private readonly registry: ProviderRegistryService) {}

  async resolveActiveDriver(): Promise<CaptchaDriver> {
    const active = await this.registry.findActiveInstance("captcha");
    if (active?.driver === "turnstile") {
      return createTurnstileDriver(turnstileConfigSchema.parse(active.config));
    }
    return createMockCaptchaDriver(mockCaptchaConfigSchema.parse(active?.driver === "mock" ? active.config : {}));
  }
}
