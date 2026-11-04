import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ProductQuestionsService } from "./product-questions.service";
import { answerQuestionSchema, listQuestionsQuerySchema, type AnswerQuestionDto, type ListQuestionsQueryDto } from "./dto";

@ApiTags("product-questions")
@Controller("admin/product-questions")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("reviews.manage")
export class ProductQuestionsController {
  constructor(private readonly questions: ProductQuestionsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listQuestionsQuerySchema)) query: ListQuestionsQueryDto) {
    return this.questions.list(query);
  }

  @Patch(":id/answer")
  answer(@Param("id") id: string, @Body(new ZodValidationPipe(answerQuestionSchema)) body: AnswerQuestionDto, @Req() req: Request) {
    return this.questions.answer(id, body, req.staff!);
  }

  @Patch(":id/hide")
  hide(@Param("id") id: string, @Req() req: Request) {
    return this.questions.setHidden(id, req.staff!);
  }
}
