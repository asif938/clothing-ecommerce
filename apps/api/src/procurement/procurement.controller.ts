import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SuppliersService } from "./suppliers.service";
import { PurchaseOrdersService } from "./purchase-orders.service";
import {
  createPurchaseOrderSchema,
  listPurchaseOrdersQuerySchema,
  receivePurchaseOrderSchema,
  supplierSchema,
  updatePurchaseOrderSchema,
  updateSupplierSchema,
  type CreatePurchaseOrderDto,
  type ListPurchaseOrdersQueryDto,
  type ReceivePurchaseOrderDto,
  type SupplierDto,
  type UpdatePurchaseOrderDto,
  type UpdateSupplierDto,
} from "./dto";

@ApiTags("procurement")
@Controller("admin/suppliers")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("procurement.manage")
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  list() {
    return this.suppliers.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.suppliers.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(supplierSchema)) body: SupplierDto, @Req() req: Request) {
    return this.suppliers.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateSupplierSchema)) body: UpdateSupplierDto, @Req() req: Request) {
    return this.suppliers.update(id, body, req.staff!);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.suppliers.remove(id, req.staff!);
  }
}

@ApiTags("procurement")
@Controller("admin/purchase-orders")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("procurement.manage")
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listPurchaseOrdersQuerySchema)) query: ListPurchaseOrdersQueryDto) {
    return this.purchaseOrders.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.purchaseOrders.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createPurchaseOrderSchema)) body: CreatePurchaseOrderDto, @Req() req: Request) {
    return this.purchaseOrders.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updatePurchaseOrderSchema)) body: UpdatePurchaseOrderDto, @Req() req: Request) {
    return this.purchaseOrders.update(id, body, req.staff!);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.purchaseOrders.remove(id, req.staff!);
  }

  @Post(":id/send")
  send(@Param("id") id: string, @Req() req: Request) {
    return this.purchaseOrders.send(id, req.staff!);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Req() req: Request) {
    return this.purchaseOrders.cancel(id, req.staff!);
  }

  /** Receiving books stock, so it also needs `inventory.manage`. */
  @Post(":id/receive")
  @RequirePermissions("procurement.manage", "inventory.manage")
  receive(@Param("id") id: string, @Body(new ZodValidationPipe(receivePurchaseOrderSchema)) body: ReceivePurchaseOrderDto, @Req() req: Request) {
    return this.purchaseOrders.receive(id, body, req.staff!);
  }
}
