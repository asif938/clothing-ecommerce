import { BadRequestException, Controller, Get, Inject, Query, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import type { Env } from "../config/env.schema";
import { PaymentsService } from "./payments.service";

/**
 * Stands in for the hosted page a real gateway would show (docs/PROJECT_SPEC.md
 * §10.1, "Mock | Configurable success/failure/delay | Used in dev, tests,
 * demos") — the mock driver's `initiate()` redirects the browser here with
 * the real success/fail/cancel URLs carried through as query params; this
 * finalizes the mock payment server-side and bounces the browser back to
 * whichever URL matches the configured outcome, exactly like a real
 * gateway's own redirect would.
 *
 * Only does anything when staff enabled a mock provider instance
 * (`confirmByExternalRef` refuses otherwise), and only redirects back to the
 * storefront's own origin — never to an arbitrary URL from the query string.
 */
@ApiTags("payments")
@Controller("payments/mock")
export class MockPayController {
  constructor(
    private readonly payments: PaymentsService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  @Get("pay")
  async pay(
    @Query("ref") ref: string,
    @Query("outcome") outcome: "success" | "failure" | "pending",
    @Query("successUrl") successUrl: string,
    @Query("failUrl") failUrl: string,
    @Query("cancelUrl") cancelUrl: string,
    @Res() res: Response,
  ) {
    const raw = outcome === "success" ? successUrl : outcome === "failure" ? failUrl : cancelUrl;
    const destination = this.safeRedirect(raw);
    if (!ref) throw new BadRequestException({ code: "REF_REQUIRED", message: "Missing payment reference" });
    if (outcome === "success" || outcome === "failure") {
      await this.payments.confirmByExternalRef("mock", ref);
    }
    res.redirect(`${destination}${destination.includes("?") ? "&" : "?"}ref=${encodeURIComponent(ref)}`);
  }

  /** Accepts only an absolute URL on the storefront's own origin. */
  private safeRedirect(url: string | undefined): string {
    const storefront = new URL(this.config.get("STOREFRONT_URL", { infer: true }));
    try {
      if (url) {
        const parsed = new URL(url);
        if (parsed.origin === storefront.origin) return parsed.toString();
      }
    } catch {
      // fall through to the rejection below
    }
    throw new BadRequestException({ code: "INVALID_REDIRECT", message: "Redirect URL must be on the storefront" });
  }
}
