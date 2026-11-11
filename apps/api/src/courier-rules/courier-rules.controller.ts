import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CourierRulesService } from "./courier-rules.service";
import { courierRuleInputSchema, type CourierRuleInput } from "./dto";

@ApiTags("shipping")
@Controller("admin/courier-rules")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("couriers.rules.manage")
export class CourierRulesController {
  constructor(private readonly rules: CourierRulesService) {}

  @Get()
  list() {
    return this.rules.list();
  }

  /** Dry run for an order: which rule (if any) would pick the courier. Nothing is booked. */
  @Get("preview/:orderId")
  async preview(@Param("orderId") orderId: string) {
    return { match: await this.rules.resolve(orderId) };
  }

  @Post()
  create(@Body(new ZodValidationPipe(courierRuleInputSchema)) body: CourierRuleInput, @Req() req: Request) {
    return this.rules.create(body, req.staff!);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(courierRuleInputSchema)) body: CourierRuleInput, @Req() req: Request) {
    return this.rules.update(id, body, req.staff!);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@Param("id") id: string, @Req() req: Request) {
    await this.rules.remove(id, req.staff!);
  }
}
