import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ProductQuestionsService } from "./product-questions.service";
import { askQuestionSchema, type AskQuestionDto } from "./dto";

@ApiTags("store")
@Controller("store/product-questions")
export class StoreProductQuestionsController {
  constructor(private readonly questions: ProductQuestionsService) {}

  @Get("products/:productId")
  listForProduct(@Param("productId") productId: string) {
    return this.questions.listPublic(productId);
  }

  @Post()
  @UseGuards(CustomerContextGuard)
  ask(@Body(new ZodValidationPipe(askQuestionSchema)) body: AskQuestionDto, @Req() req: Request) {
    return this.questions.ask(req.customerContext?.customer?.id ?? null, body);
  }
}
