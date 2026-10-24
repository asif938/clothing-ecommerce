import { Module } from "@nestjs/common";
import { CustomersModule } from "../customers/customers.module";
import { SmsModule } from "../sms/sms.module";
import { CartModule } from "../cart/cart.module";
import { OtpService } from "./otp.service";
import { CustomerSessionService } from "./customer-session.service";
import { CustomerAuthService } from "./customer-auth.service";
import { CustomerAuthController } from "./customer-auth.controller";
import { CustomerContextModule } from "./customer-context.module";

@Module({
  imports: [CustomersModule, SmsModule, CartModule, CustomerContextModule],
  controllers: [CustomerAuthController],
  providers: [OtpService, CustomerSessionService, CustomerAuthService],
  exports: [OtpService, CustomerSessionService, CustomerContextModule],
})
export class CustomerAuthModule {}
