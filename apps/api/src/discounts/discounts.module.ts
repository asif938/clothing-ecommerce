import { Module } from "@nestjs/common";
import { ExperimentsCoreModule } from "../experiments/experiments-core.module";
import { DiscountsService } from "./discounts.service";
import { FlashSalesService } from "./flash-sales.service";
import { DiscountsController, FlashSalesController } from "./discounts.controller";

@Module({
  imports: [ExperimentsCoreModule],
  controllers: [DiscountsController, FlashSalesController],
  providers: [DiscountsService, FlashSalesService],
  exports: [DiscountsService, FlashSalesService],
})
export class DiscountsModule {}
