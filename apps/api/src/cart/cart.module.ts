import { Module } from "@nestjs/common";
import { LocationsModule } from "../locations/locations.module";
import { MediaModule } from "../media/media.module";
import { ShippingModule } from "../shipping/shipping.module";
import { DiscountsModule } from "../discounts/discounts.module";
import { PaymentRulesModule } from "../payment-rules/payment-rules.module";
import { CustomerContextModule } from "../customer-auth/customer-context.module";
import { CustomersModule } from "../customers/customers.module";
import { CartService } from "./cart.service";
import { CartPricingService } from "./cart-pricing.service";
import { CartController } from "./cart.controller";

@Module({
  imports: [LocationsModule, MediaModule, ShippingModule, DiscountsModule, PaymentRulesModule, CustomerContextModule, CustomersModule],
  controllers: [CartController],
  providers: [CartService, CartPricingService],
  exports: [CartService, CartPricingService],
})
export class CartModule {}
