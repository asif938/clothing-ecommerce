import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { RequireCustomerAuthGuard } from "../customer-auth/require-customer-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { LoyaltyService } from "./loyalty.service";
import {
  adjustPointsSchema,
  ledgerQuerySchema,
  storeProfileSchema,
  tierSchema,
  type AdjustPointsDto,
  type LedgerQueryDto,
  type StoreProfileDto,
  type TierDto,
} from "./dto";

@ApiTags("loyalty")
@Controller("admin/loyalty")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("loyalty.manage")
export class LoyaltyAdminController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get("stats")
  stats() {
    return this.loyalty.stats();
  }

  @Get("tiers")
  tiers() {
    return this.loyalty.listTiers();
  }

  @Post("tiers")
  createTier(@Body(new ZodValidationPipe(tierSchema)) body: TierDto, @Req() req: Request) {
    return this.loyalty.createTier(body, req.staff!);
  }

  @Put("tiers/:id")
  updateTier(@Param("id") id: string, @Body(new ZodValidationPipe(tierSchema)) body: TierDto, @Req() req: Request) {
    return this.loyalty.updateTier(id, body, req.staff!);
  }

  @Delete("tiers/:id")
  @HttpCode(204)
  deleteTier(@Param("id") id: string, @Req() req: Request) {
    return this.loyalty.deleteTier(id, req.staff!);
  }

  @Get("customers/:customerId")
  async customer(@Param("customerId") customerId: string, @Query(new ZodValidationPipe(ledgerQuerySchema)) query: LedgerQueryDto) {
    return { summary: await this.loyalty.summary(customerId), ledger: await this.loyalty.ledger(customerId, query.page) };
  }

  @Post("customers/:customerId/adjust")
  adjust(@Param("customerId") customerId: string, @Body(new ZodValidationPipe(adjustPointsSchema)) body: AdjustPointsDto, @Req() req: Request) {
    return this.loyalty.adjust(customerId, body, req.staff!);
  }

  /** Runs every sweep now instead of waiting for the next scheduler tick (support / testing). */
  @Post("run-sweeps")
  @HttpCode(200)
  async runSweeps() {
    await this.loyalty.runSweeps();
    return this.loyalty.bonusSweep();
  }
}

@ApiTags("store")
@Controller("store/account")
@UseGuards(CustomerContextGuard, RequireCustomerAuthGuard)
export class StoreLoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("loyalty")
  async loyaltySummary(@Req() req: Request, @Query(new ZodValidationPipe(ledgerQuerySchema)) query: LedgerQueryDto) {
    const customerId = req.customerContext!.customer!.id;
    return { summary: await this.loyalty.summary(customerId), ledger: await this.loyalty.ledger(customerId, query.page, 20) };
  }

  @Get("profile")
  profile(@Req() req: Request) {
    return this.readProfile(req.customerContext!.customer!.id);
  }

  @Patch("profile")
  async updateProfile(@Body(new ZodValidationPipe(storeProfileSchema)) body: StoreProfileDto, @Req() req: Request) {
    const customerId = req.customerContext!.customer!.id;
    const { birthday, ...rest } = body;
    await this.prisma.customer.update({
      where: { id: customerId },
      // Stored as UTC midnight of the calendar date so month/day matching never shifts by time zone.
      data: { ...rest, ...(birthday !== undefined ? { birthday: birthday ? new Date(`${birthday}T00:00:00.000Z`) : null } : {}) },
    });
    return this.readProfile(customerId);
  }

  private async readProfile(customerId: string) {
    const c = await this.prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { name: true, email: true, phone: true, birthday: true, locale: true, marketingConsentSms: true, marketingConsentEmail: true, marketingConsentWhatsapp: true },
    });
    return { ...c, birthday: c.birthday ? c.birthday.toISOString().slice(0, 10) : null };
  }
}
