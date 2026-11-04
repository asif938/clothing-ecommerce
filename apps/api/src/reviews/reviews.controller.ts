import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ReviewsService } from "./reviews.service";
import { listReviewsQuerySchema, moderateReviewSchema, type ListReviewsQueryDto, type ModerateReviewDto } from "./dto";

@ApiTags("reviews")
@Controller("admin/reviews")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("reviews.manage")
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listReviewsQuerySchema)) query: ListReviewsQueryDto) {
    return this.reviews.list(query);
  }

  @Patch(":id")
  moderate(@Param("id") id: string, @Body(new ZodValidationPipe(moderateReviewSchema)) body: ModerateReviewDto, @Req() req: Request) {
    return this.reviews.moderate(id, body, req.staff!);
  }
}
