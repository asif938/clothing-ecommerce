import { Injectable } from "@nestjs/common";
import { createMockFraudCheckDriver, mockFraudCheckConfigSchema, type FraudCheckDriver } from "@clothing/shared/providers";
import { ProviderRegistryService } from "../providers/provider-registry.service";

/** Resolves the active "fraud_check" driver (golden rule 2) — only a mock exists today (see fraud-check-mock.ts's own doc comment for why). */
@Injectable()
export class FraudCheckProvidersService {
  constructor(private readonly registry: ProviderRegistryService) {}

  async resolveActiveDriver(): Promise<FraudCheckDriver> {
    const active = await this.registry.findActiveInstance("fraud_check");
    const config = mockFraudCheckConfigSchema.parse(active?.driver === "mock" ? active.config : {});
    return createMockFraudCheckDriver(config);
  }
}
