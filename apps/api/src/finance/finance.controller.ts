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
import {
  confirmCodSettlementSchema,
  fetchCodApiSchema,
  gatewaySettlementSchema,
  importCodFileSchema,
  inspectFileSchema,
  listCodSettlementsQuerySchema,
  profitQuerySchema,
  updateCodLineSchema,
  type ConfirmCodSettlementDto,
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
