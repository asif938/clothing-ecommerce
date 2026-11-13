import { Module, type OnModuleInit } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { RewardsCoreModule } from "../rewards-core/rewards-core.module";
import { ApprovalsService } from "../approvals/approvals.service";
import { RefundsController } from "./refunds.controller";
import { RefundsService } from "./refunds.service";
import type { CompleteRefundDto } from "./dto";

@Module({
  imports: [ApprovalsModule, RewardsCoreModule],
  controllers: [RefundsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule implements OnModuleInit {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly refunds: RefundsService,
  ) {}

  onModuleInit(): void {
    this.approvals.registerExecutor("refund_complete", async (payload, requester) => {
      const { refundId, dto } = payload as { refundId: string; dto: CompleteRefundDto };
      await this.refunds.complete(refundId, dto, requester, { approved: true });
    });
  }
}
