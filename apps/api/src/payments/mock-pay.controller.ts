import { Controller, Get, Query, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { PaymentsService } from "./payments.service";

/**
 * Stands in for the hosted page a real gateway would show (docs/PROJECT_SPEC.md
 * §10.1, "Mock | Configurable success/failure/delay | Used in dev, tests,
 * demos") — the mock driver's `initiate()` redirects the browser here with
 * the real success/fail/cancel URLs carried through as query params; this
 * finalizes the mock payment server-side and bounces the browser back to
 * whichever URL matches the configured outcome, exactly like a real
 * gateway's own redirect would.
 */
@ApiTags("payments")
@Controller("payments/mock")
export class MockPayController {
  constructor(private readonly payments: PaymentsService) {}

  @Get("pay")
  async pay(
    @Query("ref") ref: string,
    @Query("outcome") outcome: "success" | "failure" | "pending",
    @Query("successUrl") successUrl: string,
    @Query("failUrl") failUrl: string,
    @Query("cancelUrl") cancelUrl: string,
    @Res() res: Response,
  ) {
    if (outcome === "success" || outcome === "failure") {
      await this.payments.confirmByExternalRef("mock", ref);
    }
    const destination = outcome === "success" ? successUrl : outcome === "failure" ? failUrl : cancelUrl;
    res.redirect(`${destination}${destination.includes("?") ? "&" : "?"}ref=${encodeURIComponent(ref)}`);
  }
}
