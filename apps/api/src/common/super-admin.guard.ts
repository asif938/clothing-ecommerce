import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/**
 * Stricter than `PermissionsGuard`: some actions (moving the whole media
 * library to a different provider) are scoped to Super Admin specifically,
 * not to any permission string a custom role could also be granted —
 * docs/PROJECT_SPEC.md change request 2026-10-22, §7. Must run after
 * `StaffAuthGuard`.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const staff = request.staff;
    if (!staff) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Not authenticated" });
    }
    if (!staff.isSuperAdmin) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Super Admin only" });
    }
    return true;
  }
}
