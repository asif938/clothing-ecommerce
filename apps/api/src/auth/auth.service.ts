import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { generateTotpSecret, generateTotpSetup, verifyPassword, verifyTotpToken } from "@clothing/shared/crypto";
import { t, type LocalizedText } from "@clothing/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { PendingLoginStore } from "./pending-login.store";
import { SessionService } from "./session.service";

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly pendingLogins: PendingLoginStore,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async login(email: string, password: string, context: RequestContext) {
    const staffUser = await this.prisma.staffUser.findUnique({ where: { email } });
    if (!staffUser || staffUser.deletedAt) {
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Incorrect email or password" });
    }
    if (staffUser.status !== "active") {
      throw new UnauthorizedException({ code: "ACCOUNT_DISABLED", message: "This account has been disabled" });
    }

    const passwordOk = await verifyPassword(staffUser.passwordHash, password);
    if (!passwordOk) {
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Incorrect email or password" });
    }

    if (staffUser.totpEnabled) {
      const loginToken = this.pendingLogins.create(staffUser.id);
      return { requiresTotp: true as const, loginToken };
    }

    return { requiresTotp: false as const, ...(await this.issueSession(staffUser.id, context)) };
  }

  async loginTotp(loginToken: string, code: string, context: RequestContext) {
    const staffUserId = this.pendingLogins.consume(loginToken);
    if (!staffUserId) {
      throw new UnauthorizedException({ code: "LOGIN_EXPIRED", message: "Log in again" });
    }
    const staffUser = await this.prisma.staffUser.findUniqueOrThrow({ where: { id: staffUserId } });
    if (!staffUser.totpSecret || !(await verifyTotpToken(staffUser.totpSecret, code))) {
      throw new UnauthorizedException({ code: "INVALID_TOTP", message: "That code isn't right" });
    }
    return await this.issueSession(staffUser.id, context);
  }

  async logout(rawToken: string, actorId: string, context: RequestContext): Promise<void> {
    await this.sessions.revokeSession(rawToken);
    await this.audit.record({
      actorType: "staff",
      actorId,
      action: "auth.logout",
      entityType: "staff_session",
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  /** Step 1 of enabling 2FA: generate a secret and QR, but don't persist `totpEnabled` yet. */
  async setupTotp(staffUserId: string) {
    const staffUser = await this.prisma.staffUser.findUniqueOrThrow({ where: { id: staffUserId } });
    const secret = generateTotpSecret();
    await this.prisma.staffUser.update({ where: { id: staffUserId }, data: { totpSecret: secret, totpEnabled: false } });

    const brandName = await this.settings.getValue<LocalizedText>("brand.name");
    const issuer = t(brandName, "en") || "Fashion Commerce Platform";
    return await generateTotpSetup(secret, staffUser.email, issuer);
  }

  /** Step 2: confirm the code from the authenticator app actually works, then enable 2FA. */
  async confirmTotp(staffUserId: string, code: string, context: RequestContext): Promise<void> {
    const staffUser = await this.prisma.staffUser.findUniqueOrThrow({ where: { id: staffUserId } });
    if (!staffUser.totpSecret || !(await verifyTotpToken(staffUser.totpSecret, code))) {
      throw new ForbiddenException({ code: "INVALID_TOTP", message: "That code isn't right" });
    }
    await this.prisma.staffUser.update({ where: { id: staffUserId }, data: { totpEnabled: true } });
    await this.audit.record({
      actorType: "staff",
      actorId: staffUserId,
      action: "auth.totp.enabled",
      entityType: "staff_user",
      entityId: staffUserId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  private async issueSession(staffUserId: string, context: RequestContext) {
    const { rawToken, expiresAt } = await this.sessions.createSession(staffUserId, context.ip, context.userAgent);
    await this.prisma.staffUser.update({ where: { id: staffUserId }, data: { lastLoginAt: new Date() } });
    await this.audit.record({
      actorType: "staff",
      actorId: staffUserId,
      action: "auth.login",
      entityType: "staff_user",
      entityId: staffUserId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
    return { token: rawToken, expiresAt };
  }
}
