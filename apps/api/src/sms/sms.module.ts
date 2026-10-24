import { Module } from "@nestjs/common";
import { ProvidersModule } from "../providers/providers.module";
import { SmsProvidersService } from "./sms-providers.service";

@Module({
  imports: [ProvidersModule],
  providers: [SmsProvidersService],
  exports: [SmsProvidersService],
})
export class SmsModule {}
