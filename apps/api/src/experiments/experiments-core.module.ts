import { Module } from "@nestjs/common";
import { ExperimentAssignmentsService } from "./experiment-assignments.service";

/**
 * Storefront-side A/B assignment (§16 M14). Depends only on global modules
 * (Prisma, Settings, Cache), so Discounts, Cart and StoreContent can import
 * it without cycles; the admin CRUD lives in ExperimentsModule.
 */
@Module({
  providers: [ExperimentAssignmentsService],
  exports: [ExperimentAssignmentsService],
})
export class ExperimentsCoreModule {}
