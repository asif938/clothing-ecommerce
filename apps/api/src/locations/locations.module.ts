import { Module } from "@nestjs/common";
import { LocationsController } from "./locations.controller";
import { StoreLocationsController } from "./store-locations.controller";
import { LocationsService } from "./locations.service";

@Module({
  controllers: [LocationsController, StoreLocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
