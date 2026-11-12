import { Module, type OnModuleInit } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { MediaModule } from "../media/media.module";
import { SchedulerService } from "../queue/scheduler.service";
import { ProductMediaController } from "./product-media.controller";
import { ProductMediaService } from "./product-media.service";
import { ProductOptionsController } from "./product-options.controller";
import { ProductOptionsService } from "./product-options.service";
import { ProductRelationsController } from "./product-relations.controller";
import { ProductRelationsService } from "./product-relations.service";
import { ProductVariantsController } from "./product-variants.controller";
import { ProductVariantsService } from "./product-variants.service";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { BundleItemsController } from "./bundle-items.controller";
import { BundleItemsService } from "./bundle-items.service";

/** Products, options & variants, product media/relations/versions (docs/PROJECT_SPEC.md §16 M2); bundle items (§16 M10) is a product-editor tab, same shape as relations. */
@Module({
  imports: [MediaModule, InventoryModule],
  controllers: [ProductsController, ProductOptionsController, ProductVariantsController, ProductMediaController, ProductRelationsController, BundleItemsController],
  providers: [ProductsService, ProductOptionsService, ProductVariantsService, ProductMediaService, ProductRelationsService, BundleItemsService],
  exports: [ProductsService, ProductVariantsService, BundleItemsService, ProductMediaService],
})
export class ProductsModule implements OnModuleInit {
  constructor(
    private readonly products: ProductsService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("product.publish_sweep", () => this.products.runPublishSweep());
  }
}
