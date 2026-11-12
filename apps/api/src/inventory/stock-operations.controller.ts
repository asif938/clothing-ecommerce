import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuditService } from "../audit/audit.service";
import { toCsv } from "../reports/csv";
import { StockTransfersService } from "./stock-transfers.service";
import { StockTakesService } from "./stock-takes.service";
import { InventoryAnalysisService } from "./inventory-analysis.service";
import {
  applyMarkdownsSchema,
  applyStockTakeSchema,
  countLinesSchema,
  createStockTakeSchema,
  createTransferSchema,
  deadStockQuerySchema,
  listStockTakesQuerySchema,
  listTransfersQuerySchema,
  receiveTransferSchema,
  scanSchema,
  sizeCurveQuerySchema,
  updateTransferSchema,
  type ApplyMarkdownsDto,
  type ApplyStockTakeDto,
  type CountLinesDto,
  type CreateStockTakeDto,
  type CreateTransferDto,
  type DeadStockQueryDto,
  type ListStockTakesQueryDto,
  type ListTransfersQueryDto,
  type ReceiveTransferDto,
  type ScanDto,
  type SizeCurveQueryDto,
  type UpdateTransferDto,
} from "./operations.dto";

@ApiTags("inventory")
@Controller("admin/inventory/transfers")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("inventory.manage")
export class StockTransfersController {
  constructor(private readonly transfers: StockTransfersService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listTransfersQuerySchema)) query: ListTransfersQueryDto) {
    return this.transfers.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.transfers.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createTransferSchema)) body: CreateTransferDto, @Req() req: Request) {
    return this.transfers.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateTransferSchema)) body: UpdateTransferDto, @Req() req: Request) {
    return this.transfers.update(id, body, req.staff!);
  }

  @Post(":id/dispatch")
  dispatch(@Param("id") id: string, @Req() req: Request) {
    return this.transfers.dispatch(id, req.staff!);
  }

  @Post(":id/receive")
  receive(@Param("id") id: string, @Body(new ZodValidationPipe(receiveTransferSchema)) body: ReceiveTransferDto, @Req() req: Request) {
    return this.transfers.receive(id, body, req.staff!);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Req() req: Request) {
    return this.transfers.cancel(id, req.staff!);
  }
}

@ApiTags("inventory")
@Controller("admin/inventory/stock-takes")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("inventory.manage")
export class StockTakesController {
  constructor(private readonly stockTakes: StockTakesService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listStockTakesQuerySchema)) query: ListStockTakesQueryDto) {
    return this.stockTakes.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.stockTakes.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createStockTakeSchema)) body: CreateStockTakeDto, @Req() req: Request) {
    return this.stockTakes.create(body, req.staff!);
  }

  @Post(":id/count")
  count(@Param("id") id: string, @Body(new ZodValidationPipe(countLinesSchema)) body: CountLinesDto, @Req() req: Request) {
    return this.stockTakes.count(id, body, req.staff!);
  }

  @Post(":id/scan")
  scan(@Param("id") id: string, @Body(new ZodValidationPipe(scanSchema)) body: ScanDto, @Req() req: Request) {
    return this.stockTakes.scan(id, body, req.staff!);
  }

  @Post(":id/apply")
  @RequirePermissions("inventory.manage", "inventory.stock_takes.apply")
  apply(@Param("id") id: string, @Body(new ZodValidationPipe(applyStockTakeSchema)) body: ApplyStockTakeDto, @Req() req: Request) {
    return this.stockTakes.apply(id, body, req.staff!);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Req() req: Request) {
    return this.stockTakes.cancel(id, req.staff!);
  }
}

@ApiTags("inventory")
@Controller("admin/inventory/analysis")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("inventory.manage")
export class InventoryAnalysisController {
  constructor(
    private readonly analysis: InventoryAnalysisService,
    private readonly audit: AuditService,
  ) {}

  @Get("size-curve")
  sizeCurve(@Query(new ZodValidationPipe(sizeCurveQuerySchema)) query: SizeCurveQueryDto) {
    return this.analysis.sizeCurve(query);
  }

  /** Cost price and stock value are cost data, so this also needs the cost-read permission (§4.1 field-level permissions). */
  @Get("dead-stock")
  @RequirePermissions("inventory.manage", "catalog.cost.read")
  async deadStock(@Query(new ZodValidationPipe(deadStockQuerySchema)) query: DeadStockQueryDto, @Req() req: Request, @Res() res: Response) {
    const report = await this.analysis.deadStock(query);
    if (query.format !== "csv") {
      res.json(report);
      return;
    }
    await this.audit.record({ actorType: "staff", actorId: req.staff!.id, action: "report.export", entityType: "report", entityId: "dead-stock.csv", after: { days: report.days, rowCount: report.rows.length } });
    const rows = report.rows.map((r) => ({ ...r, title: (r.title as { en?: string; bn?: string } | null)?.en ?? (r.title as { bn?: string } | null)?.bn ?? "", lastSaleAt: r.lastSaleAt?.toISOString() ?? "" }));
    res
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", 'attachment; filename="dead-stock.csv"')
      .send(
        toCsv(rows, [
          { key: "sku", header: "SKU" },
          { key: "title", header: "Product" },
          { key: "onHand", header: "On hand" },
          { key: "price", header: "Price (poisha)" },
          { key: "costPrice", header: "Cost (poisha)" },
          { key: "stockValue", header: "Stock value (poisha)" },
          { key: "lastSaleAt", header: "Last sale" },
          { key: "daysUnsold", header: "Days unsold" },
          { key: "suggestedPercentOff", header: "Suggested % off" },
          { key: "suggestedPrice", header: "Suggested price (poisha)" },
        ]),
      );
  }

  /** Creates price schedules, so it also needs `catalog.manage` (the permission the Price schedules screen uses). */
  @Post("markdowns")
  @RequirePermissions("inventory.manage", "catalog.manage")
  applyMarkdowns(@Body(new ZodValidationPipe(applyMarkdownsSchema)) body: ApplyMarkdownsDto, @Req() req: Request) {
    return this.analysis.applyMarkdowns(body, req.staff!);
  }
}
