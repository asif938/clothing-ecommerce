import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { RequireCustomerAuthGuard } from "../customer-auth/require-customer-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ReturnsService } from "./returns.service";
import { ReturnReasonsService } from "./return-reasons.service";
import { createReturnRequestSchema, type CreateReturnRequestDto } from "./dto";

/**
 * §6.10 "customer requests from account or order-tracking page" — the
 * request itself needs a logged-in customer (consistent with M5's account
 * area being login-gated); the anonymous order-tracking page links out to
 * login to start one, rather than this also supporting phone+order-number
 * verification the way `OrdersController`'s track/cancel do.
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
