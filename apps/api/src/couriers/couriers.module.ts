import { Module } from "@nestjs/common";
import { ProvidersModule } from "../providers/providers.module";
import { CourierProvidersService } from "./courier-providers.service";

@Module({
  imports: [ProvidersModule],
  providers: [CourierProvidersService],
  exports: [CourierProvidersService],
})
export class CouriersModule {}
