import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_KEYS } from "@clothing/shared/analytics";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { WebhooksService } from "./webhooks.service";

const webhookSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.string().trim().url().max(500),
  events: z.array(z.enum(WEBHOOK_EVENT_KEYS)).min(1),
  isActive: z.boolean().optional(),
});
const updateWebhookSchema = webhookSchema.partial();

/** Staff screens for outbound webhooks (§16 M17). */
@ApiTags("webhooks")
@Controller("admin/webhooks")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("webhooks.manage")
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get("events")
  events() {
    return WEBHOOK_EVENTS;
  }

  @Get()
  list() {
    return this.webhooks.list();
  }

  /** The response carries the signing secret — the only time it is shown. */
  @Post()
  create(@Body(new ZodValidationPipe(webhookSchema)) body: z.infer<typeof webhookSchema>, @Req() req: Request) {
    return this.webhooks.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateWebhookSchema)) body: z.infer<typeof updateWebhookSchema>, @Req() req: Request) {
    return this.webhooks.update(id, body, req.staff!);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.webhooks.remove(id, req.staff!);
  }

  @Post(":id/rotate-secret")
  @HttpCode(200)
  rotate(@Param("id") id: string, @Req() req: Request) {
    return this.webhooks.rotateSecret(id, req.staff!);
  }

  @Post(":id/test")
  @HttpCode(200)
  test(@Param("id") id: string, @Req() req: Request) {
    return this.webhooks.sendTest(id, req.staff!);
  }

  @Get(":id/deliveries")
  deliveries(@Param("id") id: string) {
    return this.webhooks.deliveries(id);
  }

  @Post("deliveries/:deliveryId/retry")
  @HttpCode(200)
  retry(@Param("deliveryId") deliveryId: string, @Req() req: Request) {
    return this.webhooks.retry(deliveryId, req.staff!);
  }
}
