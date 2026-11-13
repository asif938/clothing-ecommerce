import { Module, type OnModuleInit } from "@nestjs/common";
import { SchedulerService } from "../queue/scheduler.service";
import { CustomerContextModule } from "../customer-auth/customer-context.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { LoyaltyModule } from "../loyalty/loyalty.module";
import { RewardsCoreModule } from "../rewards-core/rewards-core.module";
import { ReferralsService } from "./referrals.service";
import { ReferralsAdminController, StoreReferralsController } from "./referrals.controller";

/** Referral program (§5.8, §6.12, §16 M16). The referee discount is a cart pricing step; the referral row is written at placement. */
@Module({
  imports: [CustomerContextModule, NotificationsModule, LoyaltyModule, RewardsCoreModule],
  controllers: [ReferralsAdminController, StoreReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly referrals: ReferralsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("referrals.rewards", () => this.referrals.rewardSweep().then(() => undefined));
  }
}
