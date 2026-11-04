import { Body, Controller, Get, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { RequireCustomerAuthGuard } from "../customer-auth/require-customer-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { StoreReviewsService } from "./store-reviews.service";
import { ReviewsService } from "./reviews.service";
import { listApprovedReviewsQuerySchema, submitReviewSchema, type ListApprovedReviewsQueryDto, type SubmitReviewDto } from "./dto";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

@ApiTags("store")
@Controller("store/reviews")
export class StoreReviewsController {
  constructor(
    private readonly storeReviews: StoreReviewsService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get("products/:productId")
  listForProduct(@Param("productId") productId: string, @Query(new ZodValidationPipe(listApprovedReviewsQuerySchema)) query: ListApprovedReviewsQueryDto) {
    return this.storeReviews.listApproved(productId, query);
  }

  @Post(":id/helpful")
  markHelpful(@Param("id") id: string) {
    return this.reviews.markHelpful(id);
  }

  @Post("photos")
  @UseGuards(CustomerContextGuard, RequireCustomerAuthGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_PHOTO_BYTES } }))
  uploadPhoto(@UploadedFile() file: Express.Multer.File) {
    return this.storeReviews.uploadPhoto(file);
  }

  @Post()
  @UseGuards(CustomerContextGuard, RequireCustomerAuthGuard)
  submit(@Body(new ZodValidationPipe(submitReviewSchema)) body: SubmitReviewDto, @Req() req: Request) {
    return this.storeReviews.submit(req.customerContext!.customer!.id, body);
  }
}
