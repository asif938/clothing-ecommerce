import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { Env } from "../config/env.schema";
import { CustomerAuthService, type LoginResult } from "./customer-auth.service";
import { googleLoginSchema, sendOtpSchema, verifyOtpSchema, type GoogleLoginDto, type SendOtpDto, type VerifyOtpDto } from "./dto";
import { CUSTOMER_ACCESS_COOKIE, CUSTOMER_REFRESH_COOKIE } from "./customer-session.service";
import { ACCESS_TOKEN_TTL_MS } from "./jwt";
import { CustomerContextGuard } from "./customer-context.guard";
import { RequireCustomerAuthGuard } from "./require-customer-auth.guard";
import { CartService } from "../cart/cart.service";

@ApiTags("store")
@Controller("store/auth")
export class CustomerAuthController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly cart: CartService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get("me")
  @UseGuards(CustomerContextGuard)
  me(@Req() req: Request) {
    const customer = req.customerContext?.customer;
    return customer ? { loggedIn: true, phone: customer.phone } : { loggedIn: false };
  }

  @Post("otp/send")
  send(@Body(new ZodValidationPipe(sendOtpSchema)) body: SendOtpDto, @Req() req: Request) {
    return this.auth.sendOtp(body, req.ip ?? null);
  }

  @Post("otp/verify")
  @UseGuards(CustomerContextGuard)
  async verify(@Body(new ZodValidationPipe(verifyOtpSchema)) body: VerifyOtpDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (body.purpose === "change_phone") {
      const ok = await this.auth.verifyOtpOnly(body);
      return { verified: ok };
    }
    const result = await this.auth.verifyOtpAndLogin(body, req.ip ?? null, req.get("user-agent") ?? null);
    this.setAuthCookies(res, result);
    await this.mergeCartOnLogin(req, result.customerId);
    return { verified: true };
  }

  @Post("google")
  @UseGuards(CustomerContextGuard)
  async google(@Body(new ZodValidationPipe(googleLoginSchema)) body: GoogleLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.loginWithGoogle(body.idToken, req.ip ?? null, req.get("user-agent") ?? null);
    this.setAuthCookies(res, result);
    await this.mergeCartOnLogin(req, result.customerId);
    return { loggedIn: true };
  }

  /** §6.13 "Cart merge on login: combine items, keep the larger quantity per variant, re-validate." */
  private async mergeCartOnLogin(req: Request, customerId: string): Promise<void> {
    const anonymousId = req.customerContext?.anonymousId;
    if (anonymousId) await this.cart.mergeAnonymousIntoCustomer(anonymousId, customerId);
  }

  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken: string | undefined = req.cookies?.[CUSTOMER_REFRESH_COOKIE];
    if (!rawRefreshToken) return { loggedIn: false };
    const result = await this.auth.refresh(rawRefreshToken, req.ip ?? null, req.get("user-agent") ?? null);
    this.setAuthCookies(res, result);
    return { loggedIn: true };
  }

  @Post("logout")
  @UseGuards(CustomerContextGuard, RequireCustomerAuthGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken: string | undefined = req.cookies?.[CUSTOMER_REFRESH_COOKIE];
    if (rawRefreshToken) await this.auth.logout(rawRefreshToken);
    res.clearCookie(CUSTOMER_ACCESS_COOKIE, { path: "/" });
    res.clearCookie(CUSTOMER_REFRESH_COOKIE, { path: "/" });
    return { ok: true };
  }

  private setAuthCookies(res: Response, result: LoginResult): void {
    const secure = this.config.get("NODE_ENV", { infer: true }) === "production";
    res.cookie(CUSTOMER_ACCESS_COOKIE, result.accessToken, { httpOnly: true, sameSite: "lax", secure, maxAge: ACCESS_TOKEN_TTL_MS, path: "/" });
    res.cookie(CUSTOMER_REFRESH_COOKIE, result.refreshToken, { httpOnly: true, sameSite: "lax", secure, expires: result.refreshExpiresAt, path: "/" });
  }
}
