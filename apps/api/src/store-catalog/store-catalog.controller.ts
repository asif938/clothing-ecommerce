import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { StoreCatalogService } from "./store-catalog.service";
import {
  listCategoriesQuerySchema,
  listProductsQuerySchema,
  listingQuerySchema,
  suggestQuerySchema,
  type ListCategoriesQueryDto,
  type ListProductsQueryDto,
  type ListingQuery,
  type ListingQueryDto,
  type SuggestQueryDto,
} from "./dto";

/** Public storefront catalog reads (docs/PROJECT_SPEC.md §16 M4; `categories`/`products` (query-string form) also back the CMS blocks, §9.1). */
@ApiTags("store")
@Controller("store/catalog")
export class StoreCatalogController {
  constructor(private readonly catalog: StoreCatalogService) {}

  @Get("categories")
  listCategories(@Query(new ZodValidationPipe(listCategoriesQuerySchema)) query: ListCategoriesQueryDto) {
    return this.catalog.listCategories(query.ids.split(",").map((id) => id.trim()).filter(Boolean));
  }

  @Get("categories/:slug")
  async getCategory(@Param("slug") slug: string) {
    const category = await this.catalog.getCategoryBySlug(slug);
    if (!category) throw new NotFoundException("Category not found");
    return category;
  }

  @Get("collections/:slug")
  async getCollection(@Param("slug") slug: string) {
    const collection = await this.catalog.getCollectionBySlug(slug);
    if (!collection) throw new NotFoundException("Collection not found");
    return collection;
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

  @Get("products/:slug")
  async getProduct(@Param("slug") slug: string) {
    const product = await this.catalog.getProductBySlug(slug);
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  /** Category/collection listing with filters/sort/pagination/facets (§16 M4). `attr_<attributeId>=valueId1,valueId2` query params select attribute values. */
  @Get("listing")
  listListing(@Query(new ZodValidationPipe(listingQuerySchema)) query: ListingQueryDto, @Query() rawQuery: Record<string, string>) {
    const attributes: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(rawQuery)) {
      if (key.startsWith("attr_") && typeof value === "string") {
        attributes[key.slice("attr_".length)] = value.split(",").map((v) => v.trim()).filter(Boolean);
      }
    }
    const fullQuery: ListingQuery = { ...query, attributes };
    return this.catalog.listForListing(fullQuery);
  }

  @Get("suggest")
  suggest(@Query(new ZodValidationPipe(suggestQuerySchema)) query: SuggestQueryDto) {
    return this.catalog.suggest(query.q);
  }
}
