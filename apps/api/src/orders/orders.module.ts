import { Module, type OnModuleInit } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { ApprovalsService } from "../approvals/approvals.service";
import type { EditOrderDto } from "./dto";
import { StockReservationModule } from "../checkout/stock-reservation.module";
import { OrdersLifecycleModule } from "../checkout/orders-lifecycle.module";
import { OrderNumberModule } from "../checkout/order-number.module";
import { CustomersModule } from "../customers/customers.module";
import { LocationsModule } from "../locations/locations.module";
import { ShippingModule } from "../shipping/shipping.module";
import { RiskModule } from "../risk/risk.module";
import { OrdersAdminController } from "./orders-admin.controller";
import { OrdersAdminService } from "./orders-admin.service";
import { ManualOrderService } from "./manual-order.service";
import { OrderEditService } from "./order-edit.service";
import { OrderMergeSplitService } from "./order-merge-split.service";

@Module({
  imports: [StockReservationModule, OrdersLifecycleModule, OrderNumberModule, CustomersModule, LocationsModule, ShippingModule, RiskModule, ApprovalsModule],
  controllers: [OrdersAdminController],
  providers: [OrdersAdminService, ManualOrderService, OrderEditService, OrderMergeSplitService],
})
export class OrdersModule implements OnModuleInit {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly orderEdit: OrderEditService,
  ) {}

  onModuleInit(): void {
    this.approvals.registerExecutor("order_edit", async (payload, requester) => {
      const { orderId, dto } = payload as { orderId: string; dto: EditOrderDto };
      await this.orderEdit.edit(orderId, dto, requester, { approved: true });
    });
  }
}
