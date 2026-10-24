import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PaymentsService } from "./payments.service";

/** §7.5 checkout step 4 "payment method ... shown according to payment rules" — the static part (which methods are even configured) lives here; per-order disabling from payment rules comes back in the cart/checkout pricing response. */
@ApiTags("store")
@Controller("store/payments")
export class StorePaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get("methods")
  async methods() {
    return { methods: await this.payments.availableMethods() };
  }
}
