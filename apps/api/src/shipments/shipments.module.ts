import { Module, type OnModuleInit } from "@nestjs/common";
import { SchedulerService } from "../queue/scheduler.service";
import { LocationsModule } from "../locations/locations.module";
import { StockReservationModule } from "../checkout/stock-reservation.module";
import { OrdersLifecycleModule } from "../checkout/orders-lifecycle.module";
import { CouriersModule } from "../couriers/couriers.module";
import { CourierAreaMappingModule } from "../courier-area-mapping/courier-area-mapping.module";
import { ShipmentsService } from "./shipments.service";
import { ShipmentTrackingPollService } from "./shipment-tracking-poll.service";
import { ShipmentsController } from "./shipments.controller";
import { ShipmentsWebhookController } from "./shipments-webhook.controller";

@Module({
  imports: [LocationsModule, StockReservationModule, OrdersLifecycleModule, CouriersModule, CourierAreaMappingModule],
  controllers: [ShipmentsController, ShipmentsWebhookController],
  providers: [ShipmentsService, ShipmentTrackingPollService],
  exports: [ShipmentsService],
})
export class ShipmentsModule implements OnModuleInit {
  constructor(
    private readonly poll: ShipmentTrackingPollService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("shipments.poll_tracking", () => this.poll.runSweep().then(() => undefined));
  }
}
