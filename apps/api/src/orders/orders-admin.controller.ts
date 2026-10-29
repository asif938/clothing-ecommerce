import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OrdersAdminService } from "./orders-admin.service";
import { ManualOrderService } from "./manual-order.service";
import { OrderEditService } from "./order-edit.service";
import {
  addCallOutcomeSchema,
  addManualPaymentSchema,
  addNoteSchema,
  assignOrderSchema,
  bulkActionSchema,
  createManualOrderSchema,
  editOrderSchema,
  listOrdersQuerySchema,
  setTagsSchema,
  transitionOrderSchema,
  type AddCallOutcomeDto,
  type AddManualPaymentDto,
  type AddNoteDto,
  type AssignOrderDto,
  type BulkActionDto,
  type CreateManualOrderDto,
  type EditOrderDto,
  type ListOrdersQueryDto,
  type SetTagsDto,
  type TransitionOrderDto,
} from "./dto";

@ApiTags("orders")
@Controller("admin/orders")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("orders.manage")
export class OrdersAdminController {
  constructor(
    private readonly orders: OrdersAdminService,
    private readonly manualOrders: ManualOrderService,
    private readonly orderEdit: OrderEditService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(listOrdersQuerySchema)) query: ListOrdersQueryDto) {
    return this.orders.list(query);
  }

  @Post("bulk")
  bulk(@Body(new ZodValidationPipe(bulkActionSchema)) body: BulkActionDto, @Req() req: Request) {
    return this.orders.bulk(body, req.staff!);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createManualOrderSchema)) body: CreateManualOrderDto, @Req() req: Request) {
    return this.manualOrders.create(body, req.staff!);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.orders.detail(id);
  }

  @Get(":id/duplicates")
  duplicates(@Param("id") id: string) {
    return this.orders.duplicates(id);
  }

  @Patch(":id")
  edit(@Param("id") id: string, @Body(new ZodValidationPipe(editOrderSchema)) body: EditOrderDto, @Req() req: Request) {
    return this.orderEdit.edit(id, body, req.staff!);
  }

  @Post(":id/notes")
  async addNote(@Param("id") id: string, @Body(new ZodValidationPipe(addNoteSchema)) body: AddNoteDto, @Req() req: Request) {
    await this.orders.addNote(id, body, req.staff!);
    return { ok: true };
  }

  @Post(":id/call-outcomes")
  async addCallOutcome(@Param("id") id: string, @Body(new ZodValidationPipe(addCallOutcomeSchema)) body: AddCallOutcomeDto, @Req() req: Request) {
    await this.orders.addCallOutcome(id, body, req.staff!);
    return { ok: true };
  }

  @Patch(":id/assign")
  assign(@Param("id") id: string, @Body(new ZodValidationPipe(assignOrderSchema)) body: AssignOrderDto, @Req() req: Request) {
    return this.orders.assign(id, body, req.staff!);
  }

  @Patch(":id/tags")
  setTags(@Param("id") id: string, @Body(new ZodValidationPipe(setTagsSchema)) body: SetTagsDto, @Req() req: Request) {
    return this.orders.setTags(id, body, req.staff!);
  }

  @Post(":id/transition")
  transition(@Param("id") id: string, @Body(new ZodValidationPipe(transitionOrderSchema)) body: TransitionOrderDto, @Req() req: Request) {
    return this.orders.transition(id, body, req.staff!);
  }

  @Post(":id/payments")
  addPayment(@Param("id") id: string, @Body(new ZodValidationPipe(addManualPaymentSchema)) body: AddManualPaymentDto, @Req() req: Request) {
    return this.orders.addManualPayment(id, body, req.staff!);
  }
}
