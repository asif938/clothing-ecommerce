import { Controller, Get, HttpCode, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { RecommendationsService } from "./recommendations.service";
import { VisualSearchService } from "./visual-search.service";

/** Visual search uploads are downscaled to a few dozen pixels anyway; 8 MB covers any phone photo. */
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const idList = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(",").map((id) => id.trim()).filter((id) => id.length > 0 && id.length <= 64).slice(0, 30) : []));

const cartQuerySchema = z.object({ productIds: idList });
type CartQuery = z.infer<typeof cartQuerySchema>;
const forYouQuerySchema = z.object({ viewed: idList, limit: z.coerce.number().int().min(1).max(24).default(8) });
type ForYouQuery = z.infer<typeof forYouQuerySchema>;

/** Admin: recommendation stats/recompute/preview and the visual search index (§16 M14). */
@ApiTags("personalization")
@Controller("admin/personalization")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("personalization.manage")
export class PersonalizationAdminController {
  constructor(
    private readonly recommendations: RecommendationsService,
    private readonly visual: VisualSearchService,
  ) {}

  @Get("recommendations")
  stats() {
    return this.recommendations.stats();
  }

  @Post("recommendations/recompute")
  @HttpCode(200)
  recompute(@Req() req: Request) {
    return this.recommendations.recompute(req.staff!);
  }

  @Get("recommendations/products/:productId")
  preview(@Param("productId") productId: string) {
    return this.recommendations.preview(productId);
  }

  @Get("visual-search")
  visualStatus() {
    return this.visual.status();
  }

  @Post("visual-search/reindex")
  @HttpCode(200)
  reindex(@Req() req: Request) {
    return this.visual.reindex(req.staff!);
  }

  /** Try a photo from the admin — works even while the storefront switch is off, so staff can check results before launch. */
  @Post("visual-search/test")
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_PHOTO_BYTES } }))
  test(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request) {
    return this.visual.search(file, `staff:${req.staff!.id}`, { enforceEnabled: false });
  }
}

/** Public reads (§16 M14). Product/cart sections are not personal and cache-friendly; "for you" uses the browser's recently-viewed ids and, when logged in, purchase history. */
@ApiTags("store")
@Controller("store")
export class StorePersonalizationController {
  constructor(
    private readonly recommendations: RecommendationsService,
    private readonly visual: VisualSearchService,
  ) {}

  @Get("recommendations/products/:productId")
  forProduct(@Param("productId") productId: string) {
    return this.recommendations.forProduct(productId);
  }

  @Get("recommendations/cart")
  forCart(@Query(new ZodValidationPipe(cartQuerySchema)) query: CartQuery) {
    return this.recommendations.forCart(query.productIds);
  }

  @Get("recommendations/for-you")
  @UseGuards(CustomerContextGuard)
  forYou(@Query(new ZodValidationPipe(forYouQuerySchema)) query: ForYouQuery, @Req() req: Request) {
    return this.recommendations.forYou(query.viewed, req.customerContext!.customer?.id ?? null, query.limit);
  }

  @Post("visual-search")
  @HttpCode(200)
  @UseGuards(CustomerContextGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_PHOTO_BYTES } }))
  search(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request) {
    return this.visual.search(file, `visitor:${req.customerContext!.anonymousId}`);
  }
}
