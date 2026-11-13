import { Module } from "@nestjs/common";
import { CouriersModule } from "../couriers/couriers.module";
import { CodSettlementsService } from "./cod-settlements.service";
import { ExpensesService } from "./expenses.service";
import { GatewaySettlementsService } from "./gateway-settlements.service";
import { PnlService } from "./pnl.service";
import { ProfitService } from "./profit.service";
import { CodSettlementsController, ExpensesController, GatewaySettlementsController, PnlController, ProfitController } from "./finance.controller";

/** COD reconciliation, gateway settlements and the true profit report (M12); expenses and the profit & loss statement (M17). */
@Module({
  imports: [CouriersModule],
  controllers: [CodSettlementsController, GatewaySettlementsController, ProfitController, ExpensesController, PnlController],
  providers: [CodSettlementsService, GatewaySettlementsService, ProfitService, ExpensesService, PnlService],
  exports: [CodSettlementsService, ProfitService, ExpensesService, PnlService],
})
export class FinanceModule {}
