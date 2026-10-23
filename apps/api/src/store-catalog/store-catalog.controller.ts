import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { StoreCatalogService } from "./store-catalog.service";
import { listCategoriesQuerySchema, listProductsQuerySchema, type ListCategoriesQueryDto, type ListProductsQueryDto } from "./dto";

/** Public, card-sized catalog reads for CMS blocks (docs/PROJECT_SPEC.md §9.1) — not the full storefront catalog experience (Milestone 4). */
@ApiTags("store")
@Controller("store/catalog")
export class StoreCatalogController {
  constructor(private readonly catalog: StoreCatalogService) {}

  @Get("categories")
  listCategories(@Query(new ZodValidationPipe(listCategoriesQuerySchema)) query: ListCategoriesQueryDto) {
    return this.catalog.listCategories(query.ids.split(",").map((id) => id.trim()).filter(Boolean));
  }

  @Get("products")
  listProducts(@Query(new ZodValidationPipe(listProductsQuerySchema)) query: ListProductsQueryDto) {
    return this.catalog.listProducts({
      source: query.source,
      sourceId: query.sourceId,
      productIds: query.productIds ? query.productIds.split(",").map((id) => id.trim()).filter(Boolean) : undefined,
      limit: query.limit,
    });
  }
}
