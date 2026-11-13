import { Module, type OnModuleInit } from "@nestjs/common";
import { SchedulerService } from "../queue/scheduler.service";
import { AffiliatesService } from "./affiliates.service";
import { AffiliatesAdminController, StoreAffiliatesController } from "./affiliates.controller";

/** Affiliate / influencer tracking and commissions (§5.8, §16 M16). Clicks are recorded through the cart (`PUT /store/cart/affiliate`), orders attributed at placement. */
@Module({
  controllers: [AffiliatesAdminController, StoreAffiliatesController],
  providers: [AffiliatesService],
  exports: [AffiliatesService],
})
export class AffiliatesModule implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly affiliates: AffiliatesService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("affiliates.approvals", () => this.affiliates.approvalSweep().then(() => undefined));
  }
}
