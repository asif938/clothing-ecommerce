import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { RequireCustomerAuthGuard } from "../customer-auth/require-customer-auth.guard";
import { ReferralsService } from "./referrals.service";

const listSchema = z.object({ status: z.enum(["pending", "rewarded", "void"]).optional(), page: z.coerce.number().int().min(1).default(1) });
const voidSchema = z.object({ reason: z.string().trim().min(3).max(300) });
const localeQuerySchema = z.object({ locale: z.enum(["bn", "en"]).default("bn") });

@ApiTags("referrals")
@Controller("admin/referrals")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("referrals.manage")
export class ReferralsAdminController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) {
    return this.referrals.list(query.status, query.page);
  }

  @Get("stats")
  stats() {
    return this.referrals.stats();
  }

  @Post(":id/void")
  void(@Param("id") id: string, @Body(new ZodValidationPipe(voidSchema)) body: z.infer<typeof voidSchema>, @Req() req: Request) {
    return this.referrals.voidReferral(id, body.reason, req.staff!);
  }

  /** Runs the reward sweep now (support / testing). */
  @Post("run-sweep")
  runSweep() {
    return this.referrals.rewardSweep();
  }
}

@ApiTags("store")
@Controller("store")
@UseGuards(CustomerContextGuard)
export class StoreReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get("account/referrals")
  @UseGuards(RequireCustomerAuthGuard)
  mine(@Req() req: Request, @Query(new ZodValidationPipe(localeQuerySchema)) query: z.infer<typeof localeQuerySchema>) {
    return this.referrals.mine(req.customerContext!.customer!.id, query.locale);
  }

  @Get("referrals/:code")
  publicCode(@Param("code") code: string) {
    return this.referrals.publicCode(code);
  }
}
