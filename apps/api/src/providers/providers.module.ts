import { Module } from "@nestjs/common";
import { ProviderInstancesController } from "./provider-instances.controller";
import { ProviderRegistryService } from "./provider-registry.service";

@Module({
  controllers: [ProviderInstancesController],
  providers: [ProviderRegistryService],
  exports: [ProviderRegistryService],
})
export class ProvidersModule {}
