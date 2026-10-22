import { Module } from "@nestjs/common";
import { MediaModule } from "../media/media.module";
import { AttributesController } from "./attributes.controller";
import { AttributesService } from "./attributes.service";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";
import { SizeChartsController } from "./size-charts.controller";
import { SizeChartsService } from "./size-charts.service";
import { SizeSystemsController } from "./size-systems.controller";
import { SizeSystemsService } from "./size-systems.service";

/** Categories, attributes & values, size systems, size charts (docs/PROJECT_SPEC.md §16 M2). */
@Module({
  imports: [MediaModule],
  controllers: [CategoriesController, AttributesController, SizeSystemsController, SizeChartsController],
  providers: [CategoriesService, AttributesService, SizeSystemsService, SizeChartsService],
  exports: [CategoriesService, AttributesService, SizeSystemsService, SizeChartsService],
})
export class CatalogModule {}
