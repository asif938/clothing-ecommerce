import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ApprovalsService } from "./approvals.service";

const decisionSchema = z.object({ note: z.string().max(500).nullable().default(null) });
const listQuerySchema = z.object({ status: z.enum(["pending", "approved", "rejected", "failed"]).optional() });

@ApiTags("approvals")
@Controller("admin/approvals")
@UseGuards(StaffAuthGuard, PermissionsGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @RequirePermissions("approvals.decide")
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: z.infer<typeof listQuerySchema>) {
    return this.approvals.list(query.status);
  }

  @Get("pending-count")
  @RequirePermissions("approvals.decide")
  async pendingCount() {
    return { count: await this.approvals.pendingCount() };
  }

  /** What the signed-in staff member has asked for, so a requester can see whether it was approved. */
  @Get("mine")
  @RequirePermissions("orders.manage")
  mine(@Req() req: Request) {
    return this.approvals.mine(req.staff!.id);
  }

  @Post(":id/approve")
  @RequirePermissions("approvals.decide")
  approve(@Param("id") id: string, @Body(new ZodValidationPipe(decisionSchema)) body: z.infer<typeof decisionSchema>, @Req() req: Request) {
    return this.approvals.decide(id, true, body.note, req.staff!);
  }

  @Post(":id/reject")
  @RequirePermissions("approvals.decide")
  reject(@Param("id") id: string, @Body(new ZodValidationPipe(decisionSchema)) body: z.infer<typeof decisionSchema>, @Req() req: Request) {
    return this.approvals.decide(id, false, body.note, req.staff!);
  }
}
