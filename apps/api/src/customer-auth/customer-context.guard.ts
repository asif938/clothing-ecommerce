import { randomBytes } from "node:crypto";
import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { ANONYMOUS_ID_COOKIE, CUSTOMER_ACCESS_COOKIE } from "./customer-session.service";
import { verifyCustomerAccessToken } from "./jwt";
import type { Env } from "../config/env.schema";

const ANONYMOUS_ID_COOKIE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Runs on every `/store/*` request that needs cart/customer identity
 * (docs/PROJECT_SPEC.md §11.1: "anonymous carts via anonymous_id cookie").
 * Never blocks — it only populates `request.customerContext` so a handler
 * can branch on guest vs. logged-in. `RequireCustomerAuthGuard` is the one
 * that actually enforces login, for account-only routes.
 */
@Injectable()
export class CustomerContextGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const accessToken: string | undefined = request.cookies?.[CUSTOMER_ACCESS_COOKIE];
    const encryptionKey = this.config.get("APP_ENCRYPTION_KEY", { infer: true });
    const payload = accessToken ? verifyCustomerAccessToken(accessToken, encryptionKey) : null;

    let anonymousId: string | undefined = request.cookies?.[ANONYMOUS_ID_COOKIE];
    if (!anonymousId) {
      anonymousId = randomBytes(16).toString("hex");
      response.cookie(ANONYMOUS_ID_COOKIE, anonymousId, { httpOnly: true, sameSite: "lax", maxAge: ANONYMOUS_ID_COOKIE_TTL_MS });
    }

    request.customerContext = {
      customer: payload ? { id: payload.sub, phone: payload.phone } : null,
      anonymousId,
    };
    return true;
  }
}
