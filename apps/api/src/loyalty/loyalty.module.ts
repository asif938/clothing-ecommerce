import { Module, type OnModuleInit } from "@nestjs/common";
import { SchedulerService } from "../queue/scheduler.service";
import { CustomerContextModule } from "../customer-auth/customer-context.module";
import { LoyaltyService } from "./loyalty.service";
import { LoyaltyAdminController, StoreLoyaltyController } from "./loyalty.controller";

/** Loyalty program and tiers (docs/PROJECT_SPEC.md §5.8, §6.12, §16 M13). Redemption is wired into the cart pricing pipeline and checkout. */
@Module({
  imports: [CustomerContextModule],
  controllers: [LoyaltyAdminController, StoreLoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly loyalty: LoyaltyService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("loyalty.sweeps", () => this.loyalty.runSweeps());
    this.scheduler.registerRecurring("loyalty.bonuses", () => this.loyalty.bonusSweep().then(() => undefined));
  }
}
