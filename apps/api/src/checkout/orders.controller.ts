import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { RequireCustomerAuthGuard } from "../customer-auth/require-customer-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OrdersService } from "./orders.service";
import { trackOrderSchema, type TrackOrderDto } from "./dto";

@ApiTags("store")
@Controller("store/orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get("track")
  track(@Query(new ZodValidationPipe(trackOrderSchema)) query: TrackOrderDto) {
    return this.orders.trackByPhoneAndNumber(query.phone, query.orderNumber);
  }

  @Post("track/cancel")
  cancelByTracking(@Body(new ZodValidationPipe(trackOrderSchema)) body: TrackOrderDto) {
    return this.orders.cancelByTracking(body.phone, body.orderNumber);
  }

  @Get("mine")
  @UseGuards(CustomerContextGuard, RequireCustomerAuthGuard)
  mine(@Req() req: Request) {
    return this.orders.mine(req.customerContext!.customer!.id);
  }

  @Get("mine/:id")
  @UseGuards(CustomerContextGuard, RequireCustomerAuthGuard)
  detail(@Param("id") id: string, @Req() req: Request) {
    return this.orders.detail(req.customerContext!.customer!.id, id);
  }

  @Post("mine/:id/cancel")
  @UseGuards(CustomerContextGuard, RequireCustomerAuthGuard)
  cancel(@Param("id") id: string, @Req() req: Request) {
    return this.orders.cancelMine(req.customerContext!.customer!.id, id);
  }
}
