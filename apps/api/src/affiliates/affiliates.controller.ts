import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AffiliatesService } from "./affiliates.service";
import {
  affiliateSchema,
  conversionsQuerySchema,
  payoutSchema,
  rejectConversionSchema,
  type AffiliateDto,
  type ConversionsQueryDto,
  type PayoutDto,
  type RejectConversionDto,
} from "./dto";

@ApiTags("affiliates")
@Controller("admin/affiliates")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("affiliates.manage")
export class AffiliatesAdminController {
  constructor(private readonly affiliates: AffiliatesService) {}

  @Get()
  list() {
    return this.affiliates.list();
  }

  @Get("conversions")
  conversions(@Query(new ZodValidationPipe(conversionsQuerySchema)) query: ConversionsQueryDto) {
    return this.affiliates.conversions(query);
  }

  @Post("conversions/:id/reject")
  reject(@Param("id") id: string, @Body(new ZodValidationPipe(rejectConversionSchema)) body: RejectConversionDto, @Req() req: Request) {
    return this.affiliates.rejectConversion(id, body, req.staff!);
  }

  /** Runs the approval sweep now (support / testing). */
  @Post("run-sweep")
  runSweep() {
    return this.affiliates.approvalSweep();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.affiliates.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(affiliateSchema)) body: AffiliateDto, @Req() req: Request) {
    return this.affiliates.create(body, req.staff!);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(affiliateSchema)) body: AffiliateDto, @Req() req: Request) {
    return this.affiliates.update(id, body, req.staff!);
  }

  @Post(":id/rotate-portal")
  rotatePortal(@Param("id") id: string, @Req() req: Request) {
    return this.affiliates.rotatePortalToken(id, req.staff!);
  }

  @Post(":id/payouts")
  @RequirePermissions("affiliates.manage", "affiliates.payouts")
  payout(@Param("id") id: string, @Body(new ZodValidationPipe(payoutSchema)) body: PayoutDto, @Req() req: Request) {
    return this.affiliates.recordPayout(id, body, req.staff!);
  }
}

/** The partner's private, read-only stats page (`/affiliate/:token` on the storefront). */
@ApiTags("store")
@Controller("store/affiliates")
export class StoreAffiliatesController {
  constructor(private readonly affiliates: AffiliatesService) {}

  @Get("portal/:token")
  portal(@Param("token") token: string) {
    return this.affiliates.portal(token);
  }
}
