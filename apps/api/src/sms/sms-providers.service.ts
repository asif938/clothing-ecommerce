import { Injectable, Logger } from "@nestjs/common";
import { createMockSmsDriver, mockSmsConfigSchema, type SmsDriver } from "@clothing/shared/providers";
import { ProviderRegistryService } from "../providers/provider-registry.service";

/**
 * Resolves the active "sms" capability driver (golden rule 2) — OTP (§6.13)
 * is the only consumer this milestone. No real BD SMS gateway drivers exist
 * yet (M7's job per §16): the mock driver is the only one in the catalog
 * today, so this always resolves to it, using a configured instance's
 * settings when one exists and the no-op default otherwise.
 */
@Injectable()
export class SmsProvidersService {
  private readonly logger = new Logger(SmsProvidersService.name);

  constructor(private readonly registry: ProviderRegistryService) {}

  async resolveActiveDriver(): Promise<SmsDriver> {
    const active = await this.registry.findActiveInstance("sms");
    const config = mockSmsConfigSchema.parse(active?.driver === "mock" ? active.config : {});
    return createMockSmsDriver(config, (to, text) => this.logger.log(`[mock sms] to=${to} text="${text}"`));
  }
}
