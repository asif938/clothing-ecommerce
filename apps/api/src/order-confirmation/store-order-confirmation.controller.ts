import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OrderConfirmationService } from "./order-confirmation.service";

const respondSchema = z.object({ action: z.enum(["confirm", "cancel"]) });

@ApiTags("store")
@Controller("store/order-confirmation")
export class StoreOrderConfirmationController {
  constructor(private readonly confirmation: OrderConfirmationService) {}

  @Get(":token")
  describe(@Param("token") token: string) {
    return this.confirmation.describe(token);
  }

  @Post(":token")
  respond(@Param("token") token: string, @Body(new ZodValidationPipe(respondSchema)) body: z.infer<typeof respondSchema>) {
    return this.confirmation.respond(token, body.action);
  }
}
