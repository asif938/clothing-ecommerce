import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CustomersAdminService } from "./customers-admin.service";
import {
  anonymizeCustomerSchema,
  blockCustomerSchema,
  listCustomersQuerySchema,
  mergeCustomersSchema,
  updateCustomerSchema,
  type AnonymizeCustomerDto,
  type BlockCustomerDto,
  type ListCustomersQueryDto,
  type MergeCustomersDto,
  type UpdateCustomerDto,
} from "./dto";

@ApiTags("customers")
@Controller("admin/customers")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("customers.manage")
export class CustomersAdminController {
  constructor(private readonly customers: CustomersAdminService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listCustomersQuerySchema)) query: ListCustomersQueryDto) {
    return this.customers.list(query);
  }

  @Post("merge")
  async merge(@Body(new ZodValidationPipe(mergeCustomersSchema)) body: MergeCustomersDto, @Req() req: Request) {
    await this.customers.merge(body.keepCustomerId, body.mergeCustomerId, req.staff!);
    return { ok: true };
  }

  @Get(":id")
  getProfile(@Param("id") id: string) {
    return this.customers.getProfile(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerDto, @Req() req: Request) {
    return this.customers.update(id, body, req.staff!);
  }

  @Post(":id/block")
  block(@Param("id") id: string, @Body(new ZodValidationPipe(blockCustomerSchema)) body: BlockCustomerDto, @Req() req: Request) {
    return this.customers.block(id, body, req.staff!);
  }

  @Post(":id/privacy-export")
  @RequirePermissions("customers.privacy")
  exportData(@Param("id") id: string, @Req() req: Request) {
    return this.customers.exportData(id, req.staff!);
  }

  @Post(":id/anonymize")
  @RequirePermissions("customers.privacy")
  async anonymize(@Param("id") id: string, @Body(new ZodValidationPipe(anonymizeCustomerSchema)) body: AnonymizeCustomerDto, @Req() req: Request) {
    await this.customers.anonymize(id, body, req.staff!);
    return { ok: true };
  }
}
