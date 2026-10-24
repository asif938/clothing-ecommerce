import { Module } from "@nestjs/common";
import { LocationsModule } from "../locations/locations.module";
import { ShippingService } from "./shipping.service";
import { ShippingController } from "./shipping.controller";
import { StoreShippingController } from "./store-shipping.controller";

@Module({
  imports: [LocationsModule],
  controllers: [ShippingController, StoreShippingController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
