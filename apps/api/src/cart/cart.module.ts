import { Module } from "@nestjs/common";
import { LocationsModule } from "../locations/locations.module";
import { MediaModule } from "../media/media.module";
import { ShippingModule } from "../shipping/shipping.module";
import { DiscountsModule } from "../discounts/discounts.module";
import { PaymentRulesModule } from "../payment-rules/payment-rules.module";
import { CustomerContextModule } from "../customer-auth/customer-context.module";
import { CustomersModule } from "../customers/customers.module";
import { LoyaltyModule } from "../loyalty/loyalty.module";
import { ExperimentsCoreModule } from "../experiments/experiments-core.module";
import { RewardsCoreModule } from "../rewards-core/rewards-core.module";
import { ReferralsModule } from "../referrals/referrals.module";
import { AffiliatesModule } from "../affiliates/affiliates.module";
import { CartService } from "./cart.service";
import { CartPricingService } from "./cart-pricing.service";
import { CartController } from "./cart.controller";

@Module({
  imports: [LocationsModule, MediaModule, ShippingModule, DiscountsModule, PaymentRulesModule, CustomerContextModule, CustomersModule, LoyaltyModule, ExperimentsCoreModule, RewardsCoreModule, ReferralsModule, AffiliatesModule],
  controllers: [CartController],
  providers: [CartService, CartPricingService],
  exports: [CartService, CartPricingService],
})
export class CartModule {}
