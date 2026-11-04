import { randomInt } from "node:crypto";
import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { hashPassword, verifyPassword } from "@clothing/shared/crypto";
import type { OtpPurpose } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { SmsProvidersService } from "../sms/sms-providers.service";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * OTP (docs/PROJECT_SPEC.md §6.13): 6 digits (setting 4-6), valid 5 min, max
 * 5 attempts, resend after 60s, rate-limited per phone/IP. Codes are hashed
 * at rest (argon2, same primitive as staff passwords — the real
 * anti-bruteforce property here is the attempt counter and short TTL, not
 * the hash algorithm). The message text now goes through the M7
 * `otp_verification` template (bn/en, admin-editable — see
 * `NotificationsService.renderOtpMessage`) instead of a hardcoded English
 * placeholder, but the send itself stays synchronous and outside the
 * queued/retried dispatch pipeline used for order events — the customer is
 * waiting for this code right now, so it still goes straight through
 * `SmsProvidersService`, unchanged from M5. Locale isn't threaded from the
 * storefront request into this call yet, so it always renders the `bn`
 * copy — a reasonable simplification until a real need to localize OTP by
 * request locale shows up.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly sms: SmsProvidersService,
    private readonly notifications: NotificationsService,
  ) {}

  async send(phone: string, purpose: OtpPurpose, ip: string | null): Promise<{ sent: true; devCode?: string }> {
    const [length, ttlMinutes, resendSeconds, maxSendsPer10Min] = await Promise.all([
      this.settings.getValue<number>("auth.otpLength"),
      this.settings.getValue<number>("auth.otpTtlMinutes"),
      this.settings.getValue<number>("auth.otpResendSeconds"),
      this.settings.getValue<number>("auth.otpMaxSendsPerPhonePer10Min"),
    ]);

    const latest = await this.prisma.otpCode.findFirst({ where: { phone, purpose }, orderBy: { createdAt: "desc" } });
    if (latest && Date.now() - latest.createdAt.getTime() < resendSeconds * 1000) {
      throw new HttpException({ code: "OTP_RESEND_TOO_SOON", message: `Please wait before requesting another code.` }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentCount = await this.prisma.otpCode.count({ where: { phone, purpose, createdAt: { gte: tenMinutesAgo } } });
    if (recentCount >= maxSendsPer10Min) {
      throw new HttpException({ code: "OTP_RATE_LIMITED", message: "Too many codes requested for this number recently." }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = Array.from({ length }, () => randomInt(0, 10)).join("");
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    await this.prisma.otpCode.create({ data: { phone, purpose, codeHash, expiresAt, ip } });

    const locale = "bn";
    const message = await this.notifications.renderOtpMessage(locale, code);
    const driver = await this.sms.resolveActiveDriver();
    try {
      await driver.send(phone, message.body);
      await this.notifications.logImmediate({ event: "otp_verification", channel: "sms", recipientType: "guest", to: phone, locale, body: message.body, status: "sent" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "unknown error";
      await this.notifications.logImmediate({ event: "otp_verification", channel: "sms", recipientType: "guest", to: phone, locale, body: message.body, status: "failed", lastError: errorMessage });
      this.logger.warn(`OTP send failed for ${phone}: ${errorMessage}`);
    }

    // Dev/demo convenience only (no real SMS gateway is configured yet in
    // this environment) — never expose the code in production.
    return { sent: true, devCode: process.env.NODE_ENV === "production" ? undefined : code };
  }

  async verify(phone: string, purpose: OtpPurpose, code: string): Promise<boolean> {
    const maxAttempts = await this.settings.getValue<number>("auth.otpMaxAttempts");
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) throw new BadRequestException({ code: "OTP_INVALID_OR_EXPIRED", message: "No valid code found. Please request a new one." });

    if (otp.attempts >= maxAttempts) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
      throw new BadRequestException({ code: "OTP_MAX_ATTEMPTS", message: "Too many incorrect attempts. Please request a new code." });
    }

    const matches = await verifyPassword(otp.codeHash, code);
    if (!matches) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      return false;
    }

    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    return true;
  }
}
