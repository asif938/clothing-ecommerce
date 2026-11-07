import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { RequireCustomerAuthGuard } from "../customer-auth/require-customer-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SizeRecommenderService } from "./size-recommender.service";
import { recommendSizeSchema, upsertMeasurementsSchema, type RecommendSizeDto, type UpsertMeasurementsDto } from "./dto";

@ApiTags("store")
@Controller("store/account/measurements")
export class StoreMeasurementsController {
  constructor(private readonly service: SizeRecommenderService) {}

  @Get()
  @UseGuards(CustomerContextGuard, RequireCustomerAuthGuard)
  get(@Req() req: Request) {
    return this.service.getMeasurements(req.customerContext!.customer!.id);
  }

  @Put()
  @UseGuards(CustomerContextGuard, RequireCustomerAuthGuard)
  upsert(@Body(new ZodValidationPipe(upsertMeasurementsSchema)) body: UpsertMeasurementsDto, @Req() req: Request) {
    return this.service.upsertMeasurements(req.customerContext!.customer!.id, body);
  }
}

/** No login required — a guest can type measurements in and get a recommendation; a logged-in customer may omit them and reuse their saved profile. */
@ApiTags("store")
@Controller("store/size-recommender")
export class StoreSizeRecommenderController {
  constructor(private readonly service: SizeRecommenderService) {}

  @Post("products/:slug")
  @UseGuards(CustomerContextGuard)
  recommend(@Param("slug") slug: string, @Body(new ZodValidationPipe(recommendSizeSchema)) body: RecommendSizeDto, @Req() req: Request) {
    return this.service.recommendForProduct(slug, req.customerContext?.customer?.id ?? null, body);
  }
}
