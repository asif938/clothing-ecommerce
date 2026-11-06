import { ForbiddenException, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { isIpAllowed } from "../common/ip-allowlist";
import { SKIP_TOTP_ENFORCEMENT_METADATA_KEY } from "../common/skip-totp-enforcement.decorator";
import { SettingsService } from "../settings/settings.service";
import { SessionService, STAFF_SESSION_COOKIE } from "./session.service";

@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // §12 "optional IP allow-list setting" — checked before the session
    // itself so a disallowed IP can't even brute-force the session cookie.
    const allowlist = await this.settings.getValue<string>("security.adminIpAllowlist");
    if (allowlist && request.ip && !isIpAllowed(request.ip, allowlist)) {
      throw new ForbiddenException({ code: "IP_NOT_ALLOWED", message: "Your network isn't allowed to reach the admin panel" });
    }

    const token: string | undefined = request.cookies?.[STAFF_SESSION_COOKIE];
    if (!token) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "No session" });
    }

    const session = await this.sessions.validateSession(token);
    if (!session) {
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Invalid or expired session" });
    }

    const permissions = new Set<string>();
    let isSuperAdmin = false;
    for (const staffRole of session.staffUser.roles) {
      if (staffRole.role.isSystem) isSuperAdmin = true;
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
      isSuperAdmin,
      totpEnabled: session.staffUser.totpEnabled,
    };

    if (!session.staffUser.totpEnabled) {
      const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_TOTP_ENFORCEMENT_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!skip) {
        throw new ForbiddenException({ code: "TOTP_SETUP_REQUIRED", message: "Set up two-factor authentication to continue" });
      }
    }

    return true;
  }
}
