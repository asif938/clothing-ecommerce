import { BadRequestException, Body, Controller, Headers, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CheckoutService } from "./checkout.service";
import { placeOrderSchema, type PlaceOrderDto } from "./dto";

/** §7.5 checkout step 10 "Place order" + §11.1 "Idempotency-Key header required on place-order." */
@ApiTags("store")
@Controller("store/checkout")
@UseGuards(CustomerContextGuard)
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post("place-order")
  placeOrder(@Body(new ZodValidationPipe(placeOrderSchema)) body: PlaceOrderDto, @Headers("idempotency-key") idempotencyKey: string | undefined, @Req() req: Request) {
    if (!idempotencyKey) throw new BadRequestException({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Missing Idempotency-Key header" });
    return this.checkout.placeOrder(body, {
      identity: { customerId: req.customerContext!.customer?.id ?? null, anonymousId: req.customerContext!.anonymousId },
      idempotencyKey,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
  }
}
