import { Module } from "@nestjs/common";
import { OrderContextModule } from "../automation/order-context.service";
import { CourierRulesController } from "./courier-rules.controller";
import { CourierRulesService } from "./courier-rules.service";

@Module({
  imports: [OrderContextModule],
  controllers: [CourierRulesController],
  providers: [CourierRulesService],
  exports: [CourierRulesService],
})
export class CourierRulesModule {}
