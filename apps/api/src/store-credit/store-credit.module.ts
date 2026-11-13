import { Module } from "@nestjs/common";
import { CustomerContextModule } from "../customer-auth/customer-context.module";
import { RewardsCoreModule } from "../rewards-core/rewards-core.module";
import { StoreCreditService } from "./store-credit.service";
import { StoreCreditAdminController, StoreStoreCreditController } from "./store-credit.controller";

/** Store credit wallet screens (§5.8, §6.12, §16 M16). Redemption is a cart tender (`CartPricingService`) spent at placement. */
@Module({
  imports: [CustomerContextModule, RewardsCoreModule],
  controllers: [StoreCreditAdminController, StoreStoreCreditController],
  providers: [StoreCreditService],
  exports: [StoreCreditService],
})
export class StoreCreditModule {}
