import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OrderQueueService } from "./order-queue.service";

const participationSchema = z.object({ takesOrderQueue: z.boolean() });

@ApiTags("orders")
@Controller("admin/order-queue")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("orders.manage")
export class OrderQueueController {
  constructor(private readonly queue: OrderQueueService) {}

  @Get("mine")
  mine(@Req() req: Request) {
    return this.queue.myQueue(req.staff!);
  }

  @Get("kanban")
  kanban(@Req() req: Request, @Query("assignedTo") assignedTo?: string) {
    return this.queue.kanban(req.staff!, assignedTo || undefined);
  }

  @Get("staff")
  @RequirePermissions("orders.queue.manage")
  staff() {
    return this.queue.staffList();
  }

  @Patch("staff/:id")
  @RequirePermissions("orders.queue.manage")
  setParticipation(@Param("id") id: string, @Body(new ZodValidationPipe(participationSchema)) body: z.infer<typeof participationSchema>, @Req() req: Request) {
    return this.queue.setParticipation(id, body.takesOrderQueue, req.staff!);
  }

  @Post(":orderId/auto-assign")
  @RequirePermissions("orders.queue.manage")
  async autoAssign(@Param("orderId") orderId: string, @Req() req: Request) {
    return { assignedTo: await this.queue.autoAssign(orderId, "manual", req.staff!) };
  }
}
