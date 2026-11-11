import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PushService } from "./push.service";
import { pushSubscribeSchema, pushUnsubscribeSchema, type PushSubscribeDto, type PushUnsubscribeDto } from "./dto";

/** Admin PWA push (docs/PROJECT_SPEC.md 8.2 "Admin PWA", 16 M11): any signed-in staff member may register their own devices - no extra permission, it only ever delivers notifications they would see in the bell anyway. */
@ApiTags("notifications")
@Controller("admin/staff-push")
@UseGuards(StaffAuthGuard)
export class StaffPushController {
  constructor(private readonly push: PushService) {}

  @Get("public-key")
  async publicKey() {
    return { publicKey: (await this.push.vapidKeys()).publicKey };
  }

  @Post("subscribe")
  async subscribe(@Body(new ZodValidationPipe(pushSubscribeSchema)) body: PushSubscribeDto, @Req() req: Request) {
    await this.push.subscribeStaff({
      staffUserId: req.staff!.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: req.headers["user-agent"] ?? null,
      locale: body.locale,
    });
    return { ok: true };
  }

  @Post("unsubscribe")
  async unsubscribe(@Body(new ZodValidationPipe(pushUnsubscribeSchema)) body: PushUnsubscribeDto, @Req() req: Request) {
    await this.push.unsubscribeStaff(req.staff!.id, body.endpoint);
    return { ok: true };
  }
}
