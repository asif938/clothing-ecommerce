import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { DashboardService } from "./dashboard.service";
import { DashboardController } from "./dashboard.controller";
import { DashboardLayoutsService } from "./dashboard-layouts.service";

@Module({
  imports: [InventoryModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardLayoutsService],
})
export class DashboardModule {}
