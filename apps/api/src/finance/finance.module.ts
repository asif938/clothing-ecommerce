import { Module } from "@nestjs/common";
import { CouriersModule } from "../couriers/couriers.module";
import { CodSettlementsService } from "./cod-settlements.service";
import { GatewaySettlementsService } from "./gateway-settlements.service";
import { ProfitService } from "./profit.service";
import { CodSettlementsController, GatewaySettlementsController, ProfitController } from "./finance.controller";

/** COD reconciliation, gateway settlements and the true profit report (docs/PROJECT_SPEC.md §8.2 Finance, §16 M12). Expenses and P&L are M17. */
@Module({
  imports: [CouriersModule],
  controllers: [CodSettlementsController, GatewaySettlementsController, ProfitController],
  providers: [CodSettlementsService, GatewaySettlementsService, ProfitService],
  exports: [CodSettlementsService, ProfitService],
})
export class FinanceModule {}
