import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { RequireCustomerAuthGuard } from "../customer-auth/require-customer-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ReturnsService } from "./returns.service";
import { ReturnReasonsService } from "./return-reasons.service";
import { createReturnRequestByTrackingSchema, createReturnRequestSchema, type CreateReturnRequestByTrackingDto, type CreateReturnRequestDto } from "./dto";

/**
 * §6.10 "customer requests from account or order-tracking page". `create`
 * needs a logged-in customer; `createByTracking` (§16 M10) is the guest
 * path the order-tracking page itself uses instead, verified the same
 * phone+order-number way `OrdersController`'s track/cancel already are —
 * closing the gap M6 flagged and left for later.
 */
@ApiTags("store")
@Controller("store/returns")
export class StoreReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get("mine")
  @UseGuards(CustomerContextGuard, RequireCustomerAuthGuard)
  mine(@Req() req: Request) {
    return this.returns.mine(req.customerContext!.customer!.id);
  }

  @Post()
  @UseGuards(CustomerContextGuard, RequireCustomerAuthGuard)
  create(@Body(new ZodValidationPipe(createReturnRequestSchema)) body: CreateReturnRequestDto, @Req() req: Request) {
    return this.returns.createRequest(body, req.customerContext!.customer!.id);
  }

  /** §16 M10 — no login required; the phone+orderNumber pair is re-verified against the order itself on every call, the same trust model `/store/orders/track` already uses. */
  @Post("track")
  createByTracking(@Body(new ZodValidationPipe(createReturnRequestByTrackingSchema)) body: CreateReturnRequestByTrackingDto) {
    const { phone, orderNumber, ...rest } = body;
    return this.returns.createByTracking(phone, orderNumber, rest);
  }
}

/** Public — shown on the return-request form and can be surfaced on a policy/FAQ page without login. */
@ApiTags("store")
@Controller("store/return-reasons")
export class StoreReturnReasonsController {
  constructor(private readonly reasons: ReturnReasonsService) {}

  @Get()
  list() {
    return this.reasons.list();
  }
}
