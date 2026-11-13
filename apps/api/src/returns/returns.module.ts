import { Module } from "@nestjs/common";
import { StockReservationModule } from "../checkout/stock-reservation.module";
import { OrderNumberModule } from "../checkout/order-number.module";
import { CustomerContextModule } from "../customer-auth/customer-context.module";
import { ReturnsController, ReturnReasonsController } from "./returns.controller";
import { StoreReturnsController, StoreReturnReasonsController } from "./store-returns.controller";
import { ReturnsService } from "./returns.service";
import { RewardsCoreModule } from "../rewards-core/rewards-core.module";
import { ReturnReasonsService } from "./return-reasons.service";

@Module({
  imports: [StockReservationModule, OrderNumberModule, CustomerContextModule, RewardsCoreModule],
  controllers: [ReturnsController, ReturnReasonsController, StoreReturnsController, StoreReturnReasonsController],
  providers: [ReturnsService, ReturnReasonsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
