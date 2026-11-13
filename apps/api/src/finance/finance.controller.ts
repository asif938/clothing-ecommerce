import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuditService } from "../audit/audit.service";
import { toCsv } from "../reports/csv";
import { CourierProvidersService } from "../couriers/courier-providers.service";
import { CodSettlementsService } from "./cod-settlements.service";
import { GatewaySettlementsService } from "./gateway-settlements.service";
import { ProfitService } from "./profit.service";
import { ExpensesService } from "./expenses.service";
import { PnlService } from "./pnl.service";
import {
  confirmCodSettlementSchema,
  expenseSchema,
  fetchCodApiSchema,
  gatewaySettlementSchema,
  importCodFileSchema,
  inspectFileSchema,
  listCodSettlementsQuerySchema,
  listExpensesQuerySchema,
  pnlQuerySchema,
  updateExpenseSchema,
  profitQuerySchema,
  updateCodLineSchema,
  type ConfirmCodSettlementDto,
  type ExpenseDto,
  type ListExpensesQueryDto,
  type PnlQueryDto,
  type UpdateExpenseDto,
  type FetchCodApiDto,
  type GatewaySettlementDto,
  type ImportCodFileDto,
  type InspectFileDto,
  type ListCodSettlementsQueryDto,
  type ProfitQueryDto,
  type UpdateCodLineDto,
} from "./dto";

@ApiTags("finance")
@Controller("admin/finance/cod-settlements")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("finance.manage")
export class CodSettlementsController {
  constructor(
    private readonly cod: CodSettlementsService,
    private readonly couriers: CourierProvidersService,
  ) {}

  /** Configured couriers (plus "manual") for the import/fetch pickers. */
  @Get("couriers")
  couriersList() {
    return this.couriers.listAvailable();
  }

  @Get()
  list(@Query(new ZodValidationPipe(listCodSettlementsQuerySchema)) query: ListCodSettlementsQueryDto) {
    return this.cod.list(query);
  }

  @Get("outstanding")
  outstanding() {
    return this.cod.outstanding();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.cod.get(id);
  }

  /** Read-only: returns the file's headers + sample rows for the column-mapping step. */
  @Post("inspect")
  @HttpCode(200)
  inspect(@Body(new ZodValidationPipe(inspectFileSchema)) body: InspectFileDto) {
    return this.cod.inspect(body);
  }

  @Post("import")
  importFile(@Body(new ZodValidationPipe(importCodFileSchema)) body: ImportCodFileDto, @Req() req: Request) {
    return this.cod.importFile(body, req.staff!);
  }

  @Post("fetch")
  fetch(@Body(new ZodValidationPipe(fetchCodApiSchema)) body: FetchCodApiDto, @Req() req: Request) {
    return this.cod.fetchFromApi(body, req.staff!);
  }

  @Post(":id/rematch")
  rematch(@Param("id") id: string, @Req() req: Request) {
    return this.cod.rematch(id, req.staff!);
  }

  @Patch(":id/lines/:lineId")
  updateLine(@Param("id") id: string, @Param("lineId") lineId: string, @Body(new ZodValidationPipe(updateCodLineSchema)) body: UpdateCodLineDto, @Req() req: Request) {
    return this.cod.updateLine(id, lineId, body, req.staff!);
  }

  @Post(":id/confirm")
  confirm(@Param("id") id: string, @Body(new ZodValidationPipe(confirmCodSettlementSchema)) body: ConfirmCodSettlementDto, @Req() req: Request) {
    return this.cod.confirm(id, body, req.staff!);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.cod.remove(id, req.staff!);
  }
}

@ApiTags("finance")
@Controller("admin/finance/gateway-settlements")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("finance.manage")
export class GatewaySettlementsController {
  constructor(private readonly gateway: GatewaySettlementsService) {}

  @Get()
  list() {
    return this.gateway.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(gatewaySettlementSchema)) body: GatewaySettlementDto, @Req() req: Request) {
    return this.gateway.create(body, req.staff!);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(gatewaySettlementSchema)) body: GatewaySettlementDto, @Req() req: Request) {
    return this.gateway.update(id, body, req.staff!);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.gateway.remove(id, req.staff!);
  }
}

@ApiTags("finance")
@Controller("admin/finance/profit")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("finance.profit.read")
export class ProfitController {
  constructor(
    private readonly profit: ProfitService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async report(@Query(new ZodValidationPipe(profitQuerySchema)) query: ProfitQueryDto, @Req() req: Request, @Res() res: Response) {
    const report = await this.profit.report(query.from, query.to);
    if (query.format !== "csv") {
      res.json(report);
      return;
    }
    await this.audit.record({ actorType: "staff", actorId: req.staff!.id, action: "report.export", entityType: "report", entityId: `profit-${query.groupBy}.csv`, after: { from: query.from, to: query.to } });
    const csv =
      query.groupBy === "order"
        ? toCsv(
            report.orders.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() })),
            [
              { key: "orderNumber", header: "Order" },
              { key: "createdAt", header: "Placed" },
              { key: "status", header: "Status" },
              { key: "revenue", header: "Revenue (poisha)" },
              { key: "cogs", header: "COGS (poisha)" },
              { key: "courierCost", header: "Courier (poisha)" },
              { key: "gatewayFees", header: "Gateway fees (poisha)" },
              { key: "refunds", header: "Refunds (poisha)" },
              { key: "profit", header: "Profit (poisha)" },
              { key: "courierEstimated", header: "Courier estimated" },
              { key: "uncostedUnits", header: "Uncosted units" },
            ],
          )
        : toCsv(report.days as unknown as Record<string, unknown>[], [
            { key: "day", header: "Day" },
            { key: "orders", header: "Orders" },
            { key: "revenue", header: "Revenue (poisha)" },
            { key: "cogs", header: "COGS (poisha)" },
            { key: "courierCost", header: "Courier (poisha)" },
            { key: "gatewayFees", header: "Gateway fees (poisha)" },
            { key: "profit", header: "Profit (poisha)" },
          ]);
    res.header("Content-Type", "text/csv").header("Content-Disposition", `attachment; filename="profit-${query.groupBy}.csv"`).send(csv);
  }
}

@ApiTags("finance")
@Controller("admin/finance/expenses")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("expenses.manage")
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query(new ZodValidationPipe(listExpensesQuerySchema)) query: ListExpensesQueryDto, @Req() req: Request, @Res() res: Response) {
    const result = await this.expenses.list(query);
    if (query.format !== "csv") {
      res.json(result);
      return;
    }
    await this.audit.record({ actorType: "staff", actorId: req.staff!.id, action: "report.export", entityType: "report", entityId: "expenses.csv", after: { from: query.from, to: query.to, category: query.category } });
    const csv = toCsv(result.rows as unknown as Record<string, unknown>[], [
      { key: "date", header: "Date" },
      { key: "category", header: "Category" },
      { key: "amount", header: "Amount (poisha)" },
      { key: "note", header: "Note" },
    ]);
    res.header("Content-Type", "text/csv").header("Content-Disposition", 'attachment; filename="expenses.csv"').send(csv);
  }

  @Post()
  create(@Body(new ZodValidationPipe(expenseSchema)) body: ExpenseDto, @Req() req: Request) {
    return this.expenses.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateExpenseSchema)) body: UpdateExpenseDto, @Req() req: Request) {
    return this.expenses.update(id, body, req.staff!);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.expenses.remove(id, req.staff!);
  }
}

@ApiTags("finance")
@Controller("admin/finance/pnl")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("finance.pnl.read")
export class PnlController {
  constructor(
    private readonly pnl: PnlService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async report(@Query(new ZodValidationPipe(pnlQuerySchema)) query: PnlQueryDto, @Req() req: Request, @Res() res: Response) {
    const report = await this.pnl.report(query.from, query.to, query.groupBy);
    if (query.format !== "csv") {
      res.json(report);
      return;
    }
    await this.audit.record({ actorType: "staff", actorId: req.staff!.id, action: "report.export", entityType: "report", entityId: "pnl.csv", after: { from: query.from, to: query.to, groupBy: query.groupBy } });
    const statements = query.groupBy === "month" ? report.months.map((m) => ({ period: m.month, ...m.statement })) : [{ period: "total", ...report.total }];
    const csv = toCsv(statements as unknown as Record<string, unknown>[], [
      { key: "period", header: "Period" },
      { key: "revenue", header: "Revenue (poisha)" },
      { key: "cogs", header: "COGS (poisha)" },
      { key: "grossProfit", header: "Gross profit (poisha)" },
      { key: "courierCost", header: "Courier (poisha)" },
      { key: "gatewayFees", header: "Gateway fees (poisha)" },
      { key: "contribution", header: "Contribution (poisha)" },
      { key: "adSpend", header: "Ad spend (poisha)" },
      { key: "operatingExpenses", header: "Operating expenses (poisha)" },
      { key: "netProfit", header: "Net profit (poisha)" },
    ]);
    res.header("Content-Type", "text/csv").header("Content-Disposition", `attachment; filename="pnl-${query.groupBy}.csv"`).send(csv);
  }
}
