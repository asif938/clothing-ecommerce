import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PickListService } from "./pick-list.service";
import { PackingService } from "./packing.service";
import { HandoverService } from "./handover.service";
import { completePackingSchema, markHandedOverSchema, type CompletePackingDto, type MarkHandedOverDto } from "./dto";

@ApiTags("fulfillment")
@Controller("admin/fulfillment")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("fulfillment.manage")
export class FulfillmentController {
  constructor(
    private readonly pickList: PickListService,
    private readonly packing: PackingService,
    private readonly handover: HandoverService,
  ) {}

  @Get("pick-list")
  pickListFor(@Query("locationId") locationId?: string) {
    return this.pickList.generate(locationId);
  }

  @Post("orders/:orderId/start-processing")
  async startProcessing(@Param("orderId") orderId: string, @Req() req: Request) {
    await this.packing.startProcessing(orderId, req.staff!);
    return { ok: true };
  }

  @Get("orders/by-barcode/:code")
  findByBarcode(@Param("code") code: string) {
    return this.packing.findByBarcode(code);
  }

  @Post("orders/:orderId/complete-packing")
  completePacking(@Param("orderId") orderId: string, @Body(new ZodValidationPipe(completePackingSchema)) body: CompletePackingDto, @Req() req: Request) {
    return this.packing.completePacking(orderId, body, req.staff!);
  }

  @Get("handover-manifest")
  manifest(@Query("courierProviderInstanceId") courierProviderInstanceId?: string) {
    return this.handover.manifestFor(courierProviderInstanceId ?? null);
  }

  @Post("handover-manifest/mark-handed-over")
  markHandedOver(@Body(new ZodValidationPipe(markHandedOverSchema)) body: MarkHandedOverDto, @Req() req: Request) {
    return this.handover.markHandedOver(body.shipmentIds, req.staff!);
  }
}
