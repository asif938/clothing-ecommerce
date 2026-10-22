import { Global, Module } from "@nestjs/common";
import "@clothing/shared/settings"; // registers every Milestone 1 setting definition
import { SettingsController } from "./settings.controller";
import { StoreConfigController } from "./store-config.controller";
import { SettingsService } from "./settings.service";

/** @Global: SessionService, ProvidersModule, and others all need SettingsService. */
@Global()
@Module({
  controllers: [SettingsController, StoreConfigController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
