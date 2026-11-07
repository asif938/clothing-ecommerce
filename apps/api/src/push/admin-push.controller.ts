import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SettingsService } from "../settings/settings.service";
import { PushService } from "./push.service";
import { sendTestPushSchema, type SendTestPushDto } from "./dto";

@ApiTags("notifications")
@Controller("admin/push")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("settings.pwa.write")
export class AdminPushController {
  constructor(
    private readonly push: PushService,
    private readonly settings: SettingsService,
  ) {}

  @Get("status")
  async status() {
    const [{ publicKey }, subscriptionCount] = await Promise.all([this.push.vapidKeys(), this.push.countSubscriptions()]);
    return { configured: Boolean(publicKey), subscriptionCount };
  }

  @Post("generate-vapid-keys")
  async generateVapidKeys(@Req() req: Request) {
    const { publicKey, privateKey } = this.push.generateKeypair();
    const context = { ip: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null };
    await this.settings.setValue("pwa.vapidPublicKey", publicKey, req.staff!, context);
    await this.settings.setValue("pwa.vapidPrivateKey", privateKey, req.staff!, context);
    return { publicKey };
  }

  @Post("send-test")
  sendTest(@Body(new ZodValidationPipe(sendTestPushSchema)) body: SendTestPushDto) {
    return this.push.sendToCustomer(body.customerId, { title: body.title, body: body.body });
  }
}
