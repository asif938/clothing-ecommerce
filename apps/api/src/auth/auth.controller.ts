import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { Env } from "../config/env.schema";
import { AuthService } from "./auth.service";
import { loginSchema, loginTotpSchema, totpConfirmSchema, type LoginDto, type LoginTotpDto, type TotpConfirmDto } from "./dto";
import { STAFF_SESSION_COOKIE } from "./session.service";
import { StaffAuthGuard } from "./staff-auth.guard";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post("login")
  async login(@Body(new ZodValidationPipe(loginSchema)) body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(body.email, body.password, this.context(req));
    if (!result.requiresTotp) this.setSessionCookie(res, result.token, result.expiresAt);
    return result.requiresTotp ? { requiresTotp: true, loginToken: result.loginToken } : { requiresTotp: false };
  }

  @Post("login/totp")
  async loginTotp(@Body(new ZodValidationPipe(loginTotpSchema)) body: LoginTotpDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, expiresAt } = await this.auth.loginTotp(body.loginToken, body.code, this.context(req));
    this.setSessionCookie(res, token, expiresAt);
    return { requiresTotp: false };
  }

  @Post("logout")
  @UseGuards(StaffAuthGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: string = req.cookies[STAFF_SESSION_COOKIE];
    await this.auth.logout(token, req.staff!.id, this.context(req));
    res.clearCookie(STAFF_SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }

  @Get("me")
  @UseGuards(StaffAuthGuard)
  me(@Req() req: Request) {
    const staff = req.staff!;
    return { id: staff.id, name: staff.name, email: staff.email, locale: staff.locale, permissions: [...staff.permissions], isSuperAdmin: staff.isSuperAdmin };
  }

  @Post("totp/setup")
  @UseGuards(StaffAuthGuard)
  async setupTotp(@Req() req: Request) {
    return await this.auth.setupTotp(req.staff!.id);
  }

  @Post("totp/confirm")
  @UseGuards(StaffAuthGuard)
  async confirmTotp(@Body(new ZodValidationPipe(totpConfirmSchema)) body: TotpConfirmDto, @Req() req: Request) {
    await this.auth.confirmTotp(req.staff!.id, body.code, this.context(req));
    return { ok: true };
  }

  private context(req: Request) {
    return { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null };
  }

  private setSessionCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(STAFF_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get("NODE_ENV", { infer: true }) === "production",
      expires: expiresAt,
      path: "/",
    });
  }
}
