import { Module } from "@nestjs/common";
import { LocationsModule } from "../locations/locations.module";
import { CustomerContextModule } from "../customer-auth/customer-context.module";
import { AddressesService } from "./addresses.service";
import { AddressesController } from "./addresses.controller";

@Module({
  imports: [LocationsModule, CustomerContextModule],
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
