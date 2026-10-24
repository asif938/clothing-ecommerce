import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import { CustomersService } from "../customers/customers.service";
import { SettingsService } from "../settings/settings.service";
import type { Env } from "../config/env.schema";
import { OtpService } from "./otp.service";
import { CustomerSessionService } from "./customer-session.service";
import { signCustomerAccessToken } from "./jwt";
import type { SendOtpDto, VerifyOtpDto } from "./dto";

export interface LoginResult {
  customerId: string;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/** OTP + Google customer login (docs/PROJECT_SPEC.md §6.13). */
@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly otp: OtpService,
    private readonly customers: CustomersService,
    private readonly settings: SettingsService,
    private readonly sessions: CustomerSessionService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  sendOtp(dto: SendOtpDto, ip: string | null) {
    return this.otp.send(dto.phone, dto.purpose, ip);
  }

  /** Verifies the code and, for `login`/`checkout` purposes, finds-or-creates the customer and issues a session. `change_phone` only verifies — the caller (profile update) does the attaching. */
  async verifyOtpAndLogin(dto: VerifyOtpDto, ip: string | null, device: string | null): Promise<LoginResult> {
    const ok = await this.otp.verify(dto.phone, dto.purpose, dto.code);
    if (!ok) throw new BadRequestException({ code: "OTP_INCORRECT", message: "Incorrect code" });

    const customer = await this.customers.findOrCreateByPhone(dto.phone);
    await this.customers.recordLastSeen(customer.id);
    return await this.issueSession(customer.id, customer.phone, ip, device);
  }

  async verifyOtpOnly(dto: VerifyOtpDto): Promise<boolean> {
    return await this.otp.verify(dto.phone, dto.purpose, dto.code);
  }

  async loginWithGoogle(idToken: string, ip: string | null, device: string | null): Promise<LoginResult> {
    const enabled = await this.settings.getValue<boolean>("auth.googleEnabled");
    if (!enabled) throw new ServiceUnavailableException({ code: "GOOGLE_LOGIN_DISABLED", message: "Google sign-in is not enabled" });
    const clientId = await this.settings.getValue<string | null>("auth.googleClientId");
    const clientSecret = await this.settings.getValue<string | null>("auth.googleClientSecret");
    if (!clientId || !clientSecret) throw new ServiceUnavailableException({ code: "GOOGLE_LOGIN_NOT_CONFIGURED", message: "Google sign-in is not configured" });

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken, audience: clientId }).catch(() => null);
    const payload = ticket?.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new BadRequestException({ code: "GOOGLE_TOKEN_INVALID", message: "Invalid Google token" });
    }

    const customer = await this.customers.findOrCreateByGoogle(payload.sub, payload.email, payload.name ?? null);
    await this.customers.recordLastSeen(customer.id);
    return await this.issueSession(customer.id, customer.phone, ip, device);
  }

  async refresh(rawRefreshToken: string, ip: string | null, device: string | null): Promise<LoginResult> {
    const rotated = await this.sessions.rotate(rawRefreshToken, ip, device);
    if (!rotated) throw new BadRequestException({ code: "REFRESH_INVALID", message: "Session expired, please log in again" });
    const customer = await this.customers.findById(rotated.customerId);
    if (!customer) throw new BadRequestException({ code: "REFRESH_INVALID", message: "Session expired, please log in again" });
    const accessToken = signCustomerAccessToken({ sub: customer.id, phone: customer.phone }, this.config.get("APP_ENCRYPTION_KEY", { infer: true }));
    return { customerId: customer.id, accessToken, refreshToken: rotated.rawToken, refreshExpiresAt: rotated.expiresAt };
  }

  logout(rawRefreshToken: string): Promise<void> {
    return this.sessions.revoke(rawRefreshToken);
  }

  private async issueSession(customerId: string, phone: string | null, ip: string | null, device: string | null): Promise<LoginResult> {
    const accessToken = signCustomerAccessToken({ sub: customerId, phone }, this.config.get("APP_ENCRYPTION_KEY", { infer: true }));
    const { rawToken, expiresAt } = await this.sessions.createSession(customerId, ip, device);
    return { customerId, accessToken, refreshToken: rawToken, refreshExpiresAt: expiresAt };
  }
}
