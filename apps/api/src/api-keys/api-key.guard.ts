import { ForbiddenException, HttpException, HttpStatus, Injectable, SetMetadata, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { SettingsService } from "../settings/settings.service";
import { ApiKeysService, type AuthenticatedApiKey } from "./api-keys.service";
import { FixedWindowRateLimiter, extractApiKey, hasScope } from "./api-key";

export const API_SCOPES_METADATA_KEY = "api-scopes";
/** Declares the scopes a public API route needs, e.g. `@RequireScopes("orders.read")`. */
export const RequireScopes = (...scopes: string[]) => SetMetadata(API_SCOPES_METADATA_KEY, scopes);

declare module "express-serve-static-core" {
  interface Request {
    apiKey?: AuthenticatedApiKey;
  }
}

/**
 * Guards the public API (docs/PROJECT_SPEC.md §11.1, §16 M17): the feature
 * must be switched on, the request must carry a live key, the key must hold
 * the route's scopes, and it must be within its per-minute rate limit. The
 * limiter lives on the guard (a singleton), so counts are shared by every
 * route.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly limiter = new FixedWindowRateLimiter(60_000);

  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeys: ApiKeysService,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await this.settings.getValue<boolean>("publicApi.enabled"))) {
      throw new ForbiddenException({ code: "PUBLIC_API_DISABLED", message: "The public API is switched off for this store" });
    }
    const request = context.switchToHttp().getRequest<Request>();
    const presented = extractApiKey(request.headers);
    if (!presented) throw new UnauthorizedException({ code: "API_KEY_REQUIRED", message: "Send your API key as `Authorization: Bearer <key>`" });
    const key = await this.apiKeys.authenticate(presented);
    if (!key) throw new UnauthorizedException({ code: "API_KEY_INVALID", message: "This API key is invalid, revoked or expired" });

    const required = this.reflector.getAllAndOverride<string[] | undefined>(API_SCOPES_METADATA_KEY, [context.getHandler(), context.getClass()]) ?? [];
    if (!hasScope(key.scopes, required)) {
      throw new ForbiddenException({ code: "INSUFFICIENT_SCOPE", message: `This key needs the scope: ${required.join(", ")}` });
    }

    const limit = await this.settings.getValue<number>("publicApi.rateLimitPerMinute");
    const hit = this.limiter.hit(key.id, limit, Date.now());
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader("X-RateLimit-Limit", String(limit));
    response.setHeader("X-RateLimit-Remaining", String(hit.remaining));
    if (!hit.allowed) {
      response.setHeader("Retry-After", String(hit.retryAfterSeconds));
      throw new HttpException({ code: "RATE_LIMITED", message: "Too many requests — slow down" }, HttpStatus.TOO_MANY_REQUESTS);
    }

    request.apiKey = key;
    return true;
  }
}
