import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { SessionService, STAFF_SESSION_COOKIE } from "./session.service";

@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token: string | undefined = request.cookies?.[STAFF_SESSION_COOKIE];
    if (!token) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "No session" });
    }

    const session = await this.sessions.validateSession(token);
    if (!session) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Invalid or expired session" });
    }

    const permissions = new Set<string>();
    for (const staffRole of session.staffUser.roles) {
      for (const rolePermission of staffRole.role.permissions) {
        permissions.add(rolePermission.permission);
      }
    }

    request.staff = {
      id: session.staffUser.id,
      name: session.staffUser.name,
      email: session.staffUser.email,
      locale: session.staffUser.locale,
      permissions,
    };
    return true;
  }
}
