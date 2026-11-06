import { Controller, Get, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { AuditService } from "../audit/audit.service";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ReportsService } from "./reports.service";
import { toCsv } from "./csv";
import { reportRangeQuerySchema, type ReportRangeQueryDto } from "./dto";

/** §8.2 "Every report: date range, compare period, export" — "compare period" is left to the admin UI (fetch the same report twice, for two ranges, and diff client-side) rather than a second server concept; export is `?format=csv` on the same endpoint instead of a separate route, so the two never drift apart. */
@ApiTags("reports")
@Controller("admin/reports")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("reports.read")
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
  ) {}

  /** §12 "audit log for ... sensitive reads (exports)" — only the CSV download counts as an export; viewing the same numbers on-screen isn't. */
  private async respond<T extends Record<string, unknown>>(req: Request, res: Response, query: ReportRangeQueryDto, rows: T[], columns: { key: keyof T; header: string }[], filename: string) {
    if (query.format === "csv") {
      await this.audit.record({
        actorType: "staff",
        actorId: req.staff!.id,
        action: "report.export",
        entityType: "report",
        entityId: filename,
        after: { from: query.from, to: query.to, rowCount: rows.length },
      });
      res.header("Content-Type", "text/csv").header("Content-Disposition", `attachment; filename="${filename}"`).send(toCsv(rows, columns));
      return;
    }
    res.json(rows);
  }

  @Get("sales")
  async sales(@Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQueryDto, @Req() req: Request, @Res() res: Response) {
    const rows = await this.reports.salesByDay(query.from, query.to);
    await this.respond(req, res, query, rows, [
      { key: "day", header: "Day" },
      { key: "orders", header: "Orders" },
      { key: "revenue", header: "Revenue (poisha)" },
      { key: "cancelled", header: "Cancelled" },
    ], "sales.csv");
  }

  @Get("products")
  async products(@Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQueryDto, @Req() req: Request, @Res() res: Response) {
    const rows = await this.reports.topProducts(query.from, query.to);
    await this.respond(req, res, query, rows, [
      { key: "sku", header: "SKU" },
      { key: "productSlug", header: "Product" },
      { key: "quantity", header: "Quantity sold" },
      { key: "revenue", header: "Revenue (poisha)" },
    ], "products.csv");
  }

  @Get("courier")
  async courier(@Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQueryDto, @Req() req: Request, @Res() res: Response) {
    const rows = await this.reports.courierPerformance(query.from, query.to);
    await this.respond(req, res, query, rows, [
      { key: "driver", header: "Courier" },
      { key: "booked", header: "Booked" },
      { key: "delivered", header: "Delivered" },
      { key: "rejected", header: "Rejected/returned" },
      { key: "successRate", header: "Success rate" },
      { key: "deliveryChargeTotal", header: "Delivery charges (poisha)" },
    ], "courier.csv");
  }

  @Get("staff")
  async staff(@Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQueryDto, @Req() req: Request, @Res() res: Response) {
    const rows = await this.reports.staffPerformance(query.from, query.to);
    await this.respond(req, res, query, rows, [
      { key: "name", header: "Staff" },
      { key: "confirmations", header: "Confirmations" },
      { key: "avgMinutesToConfirm", header: "Avg minutes to confirm" },
    ], "staff.csv");
  }

  @Get("discounts")
  async discounts(@Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQueryDto, @Req() req: Request, @Res() res: Response) {
    const rows = await this.reports.discountUsage(query.from, query.to);
    await this.respond(req, res, query, rows, [
      { key: "name", header: "Discount" },
      { key: "code", header: "Code" },
      { key: "uses", header: "Uses" },
      { key: "totalDiscounted", header: "Total discounted (poisha)" },
    ], "discounts.csv");
  }

  @Get("search-terms")
  async searchTerms(@Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQueryDto, @Req() req: Request, @Res() res: Response) {
    const rows = await this.reports.searchTerms(query.from, query.to);
    await this.respond(req, res, query, rows, [
      { key: "term", header: "Term" },
      { key: "searches", header: "Searches" },
      { key: "zeroResultSearches", header: "Zero-result searches" },
    ], "search-terms.csv");
  }
}
