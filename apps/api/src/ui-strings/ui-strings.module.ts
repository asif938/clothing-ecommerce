import { Module } from "@nestjs/common";
import { StoreUiStringsController } from "./store-ui-strings.controller";
import { UiStringsController } from "./ui-strings.controller";

@Module({
  controllers: [UiStringsController, StoreUiStringsController],
})
export class UiStringsModule {}
