import { Module } from "@nestjs/common";
import { ProvidersModule } from "../providers/providers.module";
import { BlocklistModule } from "../blocklist/blocklist.module";
import { FraudCheckProvidersService } from "./fraud-check-providers.service";
import { RiskScoringService } from "./risk-scoring.service";

@Module({
  imports: [ProvidersModule, BlocklistModule],
  providers: [FraudCheckProvidersService, RiskScoringService],
  exports: [RiskScoringService],
})
export class RiskModule {}
