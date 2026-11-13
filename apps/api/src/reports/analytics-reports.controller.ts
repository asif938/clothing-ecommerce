import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
import { REPORT_DATASETS } from "@clothing/shared/analytics";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuditService } from "../audit/audit.service";
import { CohortsService } from "./cohorts.service";
import { ReportBuilderService } from "./report-builder.service";
import { toCsv } from "./csv";
import type { ReportCell, ReportResult } from "./report-builder";

const cohortsQuerySchema = z.object({ months: z.coerce.number().int().min(2).max(24).default(12) });

const rangeSchema = z.object({ from: z.coerce.date(), to: z.coerce.date() });
const savedReportSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).nullable().optional(), config: z.unknown() });
const runBodySchema = rangeSchema.extend({ config: z.unknown(), format: z.enum(["json", "csv"]).default("json") });
const runSavedQuerySchema = rangeSchema.extend({ format: z.enum(["json", "csv"]).default("json") });

/** Cohort retention and customer lifetime value (§8.2 Reports, §16 M17). */
@ApiTags("reports")
@Controller("admin/reports/cohorts")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("reports.read")
export class CohortsController {
  constructor(private readonly cohorts: CohortsService) {}

  @Get()
  report(@Query(new ZodValidationPipe(cohortsQuerySchema)) query: z.infer<typeof cohortsQuerySchema>) {
    return this.cohorts.report(query.months);
  }
}

function resultToCsv(result: ReportResult): string {
  const rows: Record<string, ReportCell>[] = [...result.rows, { ...Object.fromEntries(result.columns.filter((c) => c.kind === "dimension").map((c, i) => [c.key, i === 0 ? "Total" : ""])), ...result.totals }];
  return toCsv(
    rows,
    result.columns.map((c) => ({ key: c.key, header: c.label.en })),
  );
}

/** Report builder: run ad-hoc, save, re-run (§8.2 Reports, §16 M17). Running needs `reports.read`; saving needs `reports.builder.manage`. */
@ApiTags("reports")
@Controller("admin/report-builder")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("reports.read")
export class ReportBuilderController {
  constructor(
    private readonly builder: ReportBuilderService,
    private readonly audit: AuditService,
  ) {}

  /** Datasets, their dimensions and metrics — the pickers render from this. */
  @Get("datasets")
  datasets() {
    return Object.values(REPORT_DATASETS);
  }

  @Get("saved")
  list() {
    return this.builder.list();
  }

  @Post("run")
  @HttpCode(200)
  async run(@Body(new ZodValidationPipe(runBodySchema)) body: z.infer<typeof runBodySchema>, @Req() req: Request, @Res() res: Response) {
    const config = this.builder.parseConfig(body.config);
    const result = await this.builder.run(config, body.from, body.to);
    await this.finish(result, body.format, "custom-report", req, res, { dataset: config.dataset, from: body.from, to: body.to });
  }

  @Get("saved/:id/run")
  async runSaved(@Param("id") id: string, @Query(new ZodValidationPipe(runSavedQuerySchema)) query: z.infer<typeof runSavedQuerySchema>, @Req() req: Request, @Res() res: Response) {
    const result = await this.builder.runSaved(id, query.from, query.to);
    await this.finish(result, query.format, `custom-report-${id}`, req, res, { reportId: id, from: query.from, to: query.to });
  }

  private async finish(result: ReportResult, format: "json" | "csv", name: string, req: Request, res: Response, audit: Record<string, unknown>) {
    if (format !== "csv") {
      res.json(result);
      return;
    }
    await this.audit.record({ actorType: "staff", actorId: req.staff!.id, action: "report.export", entityType: "report", entityId: `${name}.csv`, after: audit });
    res.header("Content-Type", "text/csv").header("Content-Disposition", `attachment; filename="${name}.csv"`).send(resultToCsv(result));
  }

  @Post("saved")
  @RequirePermissions("reports.builder.manage")
  create(@Body(new ZodValidationPipe(savedReportSchema)) body: z.infer<typeof savedReportSchema>, @Req() req: Request) {
    return this.builder.create(body, req.staff!);
  }

  @Patch("saved/:id")
  @RequirePermissions("reports.builder.manage")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(savedReportSchema.partial())) body: Partial<z.infer<typeof savedReportSchema>>, @Req() req: Request) {
    return this.builder.update(id, body, req.staff!);
  }

  @Delete("saved/:id")
  @HttpCode(204)
  @RequirePermissions("reports.builder.manage")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.builder.remove(id, req.staff!);
  }
}
