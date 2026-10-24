import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { RequireCustomerAuthGuard } from "../customer-auth/require-customer-auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AddressesService } from "./addresses.service";
import { upsertAddressSchema, type UpsertAddressDto } from "./dto";

@ApiTags("store")
@Controller("store/account/addresses")
@UseGuards(CustomerContextGuard, RequireCustomerAuthGuard)
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@Req() req: Request) {
    return this.addresses.list(req.customerContext!.customer!.id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(upsertAddressSchema)) body: UpsertAddressDto, @Req() req: Request) {
    return this.addresses.create(req.customerContext!.customer!.id, body);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(upsertAddressSchema)) body: UpsertAddressDto, @Req() req: Request) {
    return this.addresses.update(req.customerContext!.customer!.id, id, body);
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: Request) {
    await this.addresses.remove(req.customerContext!.customer!.id, id);
    return { ok: true };
  }
}
