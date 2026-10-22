import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PERMISSIONS_METADATA_KEY } from "./require-permissions.decorator";

/**
 * Golden rule 7: every admin mutation is permission-checked. Must run after
 * `StaffAuthGuard` (which populates `req.staff`) — `@UseGuards(StaffAuthGuard, PermissionsGuard)`.
 * Routes with no `@RequirePermissions(...)` are allowed through (authentication-only).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const staff = request.staff;
    if (!staff) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Not authenticated" });
    }

    const missing = required.filter((permission) => !staff.permissions.has(permission));
    if (missing.length > 0) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Missing permission(s)", missing });
    }
    return true;
  }
}
