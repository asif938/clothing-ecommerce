import { Module } from "@nestjs/common";
import { BomService } from "./bom.service";
import { MaterialsController } from "./materials.controller";
import { MaterialsService } from "./materials.service";

/** Raw materials, their stock ledger and bills of materials (docs/PROJECT_SPEC.md §16 M17). Prisma/audit/settings are @Global. */
@Module({
  controllers: [MaterialsController],
  providers: [MaterialsService, BomService],
  exports: [MaterialsService, BomService],
})
export class MaterialsModule {}
