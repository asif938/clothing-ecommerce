import { Module } from "@nestjs/common";
import { CourierAreaMappingController } from "./courier-area-mapping.controller";
import { CourierAreaMappingService } from "./courier-area-mapping.service";

@Module({
  controllers: [CourierAreaMappingController],
  providers: [CourierAreaMappingService],
  exports: [CourierAreaMappingService],
})
export class CourierAreaMappingModule {}
