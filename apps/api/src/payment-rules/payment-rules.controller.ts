import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PaymentRulesService } from "./payment-rules.service";
import { createPaymentRuleSchema, updatePaymentRuleSchema, type CreatePaymentRuleDto, type UpdatePaymentRuleDto } from "./dto";

@ApiTags("payment-rules")
@Controller("admin/payment-rules")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("payment_rules.manage")
export class PaymentRulesController {
  constructor(private readonly paymentRules: PaymentRulesService) {}

  @Get()
  list() {
    return this.paymentRules.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.paymentRules.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createPaymentRuleSchema)) body: CreatePaymentRuleDto, @Req() req: Request) {
    return this.paymentRules.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updatePaymentRuleSchema)) body: UpdatePaymentRuleDto, @Req() req: Request) {
    return this.paymentRules.update(id, body, req.staff!);
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: Request) {
    await this.paymentRules.remove(id, req.staff!);
    return { ok: true };
  }
}
