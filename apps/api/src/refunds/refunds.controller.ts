import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { RefundsService } from "./refunds.service";
import { completeRefundSchema, rejectRefundSchema, type CompleteRefundDto, type RejectRefundDto } from "./dto";

@ApiTags("refunds")
@Controller("admin/refunds")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("refunds.manage")
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get()
  list(@Query("status") status?: string) {
    return this.refunds.list(status);
  }

  @Post(":id/complete")
  complete(@Param("id") id: string, @Body(new ZodValidationPipe(completeRefundSchema)) body: CompleteRefundDto, @Req() req: Request) {
    return this.refunds.complete(id, body, req.staff!);
  }

  @Post(":id/reject")
  reject(@Param("id") id: string, @Body(new ZodValidationPipe(rejectRefundSchema)) body: RejectRefundDto, @Req() req: Request) {
    return this.refunds.reject(id, body, req.staff!);
  }
}
