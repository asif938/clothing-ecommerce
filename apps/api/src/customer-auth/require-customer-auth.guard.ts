import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/** Account-only routes (orders "mine", addresses, profile) — must run after CustomerContextGuard. */
@Injectable()
export class RequireCustomerAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.customerContext?.customer) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Login required" });
    }
    return true;
  }
}
