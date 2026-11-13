import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { RequireCustomerAuthGuard } from "../customer-auth/require-customer-auth.guard";
import { StoreCreditService } from "./store-credit.service";
import { adjustStoreCreditSchema, walletQuerySchema, type AdjustStoreCreditDto, type WalletQueryDto } from "./dto";

@ApiTags("store-credit")
@Controller("admin/store-credit")
@UseGuards(StaffAuthGuard, PermissionsGuard)
export class StoreCreditAdminController {
  constructor(private readonly storeCredit: StoreCreditService) {}

  @Get("stats")
  @RequirePermissions("customers.manage")
  stats() {
    return this.storeCredit.stats();
  }

  @Get("customers/:customerId")
  @RequirePermissions("customers.manage")
  wallet(@Param("customerId") customerId: string, @Query(new ZodValidationPipe(walletQuerySchema)) query: WalletQueryDto) {
    return this.storeCredit.wallet(customerId, query.page);
  }

  @Post("customers/:customerId/adjust")
  @RequirePermissions("store_credit.manage")
  adjust(@Param("customerId") customerId: string, @Body(new ZodValidationPipe(adjustStoreCreditSchema)) body: AdjustStoreCreditDto, @Req() req: Request) {
    return this.storeCredit.adjust(customerId, body, req.staff!);
  }
}

/** §7.3 `/account/*` "store credit" — the wallet balance and its history. Shown even while the feature is off, so customers can always see money they hold. */
@ApiTags("store")
@Controller("store/account/store-credit")
@UseGuards(CustomerContextGuard, RequireCustomerAuthGuard)
export class StoreStoreCreditController {
  constructor(private readonly storeCredit: StoreCreditService) {}

  @Get()
  wallet(@Req() req: Request, @Query(new ZodValidationPipe(walletQuerySchema)) query: WalletQueryDto) {
    return this.storeCredit.wallet(req.customerContext!.customer!.id, query.page, 20);
  }
}
