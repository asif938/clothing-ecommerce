import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ReturnsService } from "./returns.service";
import { ReturnReasonsService } from "./return-reasons.service";
import {
  approveReturnSchema,
  createReturnReasonSchema,
  inspectReturnSchema,
  rejectReturnSchema,
  updateReturnReasonSchema,
  type ApproveReturnDto,
  type CreateReturnReasonDto,
  type InspectReturnDto,
  type RejectReturnDto,
  type UpdateReturnReasonDto,
} from "./dto";

@ApiTags("returns")
@Controller("admin/returns")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("returns.manage")
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  list(@Query("status") status?: string) {
    return this.returns.list(status);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.returns.get(id);
  }

  @Post(":id/approve")
  approve(@Param("id") id: string, @Body(new ZodValidationPipe(approveReturnSchema)) body: ApproveReturnDto, @Req() req: Request) {
    return this.returns.approve(id, body, req.staff!);
  }

  @Post(":id/reject")
  reject(@Param("id") id: string, @Body(new ZodValidationPipe(rejectReturnSchema)) body: RejectReturnDto, @Req() req: Request) {
    return this.returns.reject(id, body, req.staff!);
  }

  @Post(":id/schedule-pickup")
  schedulePickup(@Param("id") id: string, @Req() req: Request) {
    return this.returns.schedulePickup(id, req.staff!);
  }

  @Post(":id/receive")
  receive(@Param("id") id: string, @Req() req: Request) {
    return this.returns.receive(id, req.staff!);
  }

  @Post(":id/inspect")
  inspect(@Param("id") id: string, @Body(new ZodValidationPipe(inspectReturnSchema)) body: InspectReturnDto, @Req() req: Request) {
    return this.returns.inspect(id, body, req.staff!);
  }

  @Post(":id/resolve")
  resolve(@Param("id") id: string, @Req() req: Request) {
    return this.returns.resolve(id, req.staff!);
  }
}

@ApiTags("returns")
@Controller("admin/return-reasons")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("returns.manage")
export class ReturnReasonsController {
  constructor(private readonly reasons: ReturnReasonsService) {}

  @Get()
  list() {
    return this.reasons.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createReturnReasonSchema)) body: CreateReturnReasonDto, @Req() req: Request) {
    return this.reasons.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateReturnReasonSchema)) body: UpdateReturnReasonDto, @Req() req: Request) {
    return this.reasons.update(id, body, req.staff!);
  }
}
