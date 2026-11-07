import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PushService } from "./push.service";
import { pushSubscribeSchema, pushUnsubscribeSchema, type PushSubscribeDto, type PushUnsubscribeDto } from "./dto";

/** Guest-friendly — the PWA may be installed before login (docs/PROJECT_SPEC.md §16 M10); `customerId` is attached when a session cookie happens to be present and left `null` otherwise. */
@ApiTags("store")
@Controller("store/push")
export class StorePushController {
  constructor(private readonly push: PushService) {}

  @Post("subscribe")
  @UseGuards(CustomerContextGuard)
  subscribe(@Body(new ZodValidationPipe(pushSubscribeSchema)) body: PushSubscribeDto, @Req() req: Request) {
    return this.push.subscribe({
      customerId: req.customerContext?.customer?.id ?? null,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: req.headers["user-agent"] ?? null,
      locale: body.locale,
    });
  }

  @Post("unsubscribe")
  async unsubscribe(@Body(new ZodValidationPipe(pushUnsubscribeSchema)) body: PushUnsubscribeDto) {
    await this.push.unsubscribe(body.endpoint);
    return { ok: true };
  }
}
