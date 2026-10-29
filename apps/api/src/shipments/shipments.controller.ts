import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CourierProvidersService } from "../couriers/courier-providers.service";
import { ShipmentsService } from "./shipments.service";
import {
  bookShipmentSchema,
  receiveAtWarehouseSchema,
  reconcilePartialDeliverySchema,
  updateShipmentStatusSchema,
  type BookShipmentDto,
  type ReceiveAtWarehouseDto,
  type ReconcilePartialDeliveryDto,
  type UpdateShipmentStatusDto,
} from "./dto";

@ApiTags("fulfillment")
@Controller("admin")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("fulfillment.manage")
export class ShipmentsController {
  constructor(
    private readonly shipments: ShipmentsService,
    private readonly couriers: CourierProvidersService,
  ) {}

  @Get("couriers/available")
  listCouriers() {
    return this.couriers.listAvailable();
  }

  @Get("orders/:orderId/shipments")
  forOrder(@Param("orderId") orderId: string) {
    return this.shipments.forOrder(orderId);
  }

  @Post("orders/:orderId/shipments")
  book(@Param("orderId") orderId: string, @Body(new ZodValidationPipe(bookShipmentSchema)) body: BookShipmentDto, @Req() req: Request) {
    return this.shipments.book(orderId, body, req.staff!);
  }

  @Get("shipments/:id")
  get(@Param("id") id: string) {
    return this.shipments.get(id);
  }

  @Patch("shipments/:id/status")
  updateStatus(@Param("id") id: string, @Body(new ZodValidationPipe(updateShipmentStatusSchema)) body: UpdateShipmentStatusDto, @Req() req: Request) {
    return this.shipments.updateStatus(id, body, req.staff!);
  }

  @Post("shipments/:id/reconcile-partial")
  reconcilePartial(@Param("id") id: string, @Body(new ZodValidationPipe(reconcilePartialDeliverySchema)) body: ReconcilePartialDeliveryDto, @Req() req: Request) {
    return this.shipments.reconcilePartialDelivery(id, body, req.staff!);
  }

  @Post("shipments/:id/receive-at-warehouse")
  receiveAtWarehouse(@Param("id") id: string, @Body(new ZodValidationPipe(receiveAtWarehouseSchema)) body: ReceiveAtWarehouseDto, @Req() req: Request) {
    return this.shipments.receiveAtWarehouse(id, body, req.staff!);
  }

  @Delete("shipments/:id")
  async cancel(@Param("id") id: string, @Req() req: Request) {
    await this.shipments.cancel(id, req.staff!);
    return { ok: true };
  }
}
