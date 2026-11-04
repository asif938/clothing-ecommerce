import { Module } from "@nestjs/common";
import { BlocklistModule } from "../blocklist/blocklist.module";
import { CustomersService } from "./customers.service";
import { CustomersAdminService } from "./customers-admin.service";
import { CustomersAdminController } from "./customers-admin.controller";
import { SegmentsService } from "./segments.service";
import { SegmentsController } from "./segments.controller";

@Module({
  imports: [BlocklistModule],
  controllers: [CustomersAdminController, SegmentsController],
  providers: [CustomersService, CustomersAdminService, SegmentsService],
  exports: [CustomersService, SegmentsService],
})
export class CustomersModule {}
