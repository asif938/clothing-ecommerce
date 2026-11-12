import { Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { QUALITY_ISSUES, SEO_CHECKS, type QualityIssue, type SeoCheck } from "@clothing/shared/marketing";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SeoAuditService } from "./seo-audit.service";

const qualityQuerySchema = z.object({
  issue: z.enum(Object.keys(QUALITY_ISSUES) as [QualityIssue, ...QualityIssue[]]).optional(),
  status: z.enum(["active", "draft", "archived"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
type QualityQueryDto = z.infer<typeof qualityQuerySchema>;

const seoQuerySchema = z.object({
  type: z.enum(["product", "category", "collection", "page", "blog"]).default("product"),
  check: z.enum(Object.keys(SEO_CHECKS) as [SeoCheck, ...SeoCheck[]]).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
type SeoQueryDto = z.infer<typeof seoQuerySchema>;

@ApiTags("catalog")
@Controller("admin/catalog/quality")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("catalog.manage")
export class ProductQualityController {
  constructor(private readonly audit: SeoAuditService) {}

  @Get()
  list(@Query(new ZodValidationPipe(qualityQuerySchema)) query: QualityQueryDto) {
    return this.audit.productQuality(query);
  }
}

@ApiTags("seo")
@Controller("admin/seo")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("seo.audit")
export class SeoAuditController {
  constructor(private readonly audit: SeoAuditService) {}

  @Get("scores")
  scores(@Query(new ZodValidationPipe(seoQuerySchema)) query: SeoQueryDto) {
    return this.audit.seoScores(query.type, query.page, query.check);
  }

  @Get("link-scans")
  scans() {
    return this.audit.listScans();
  }

  @Post("link-scans")
  start(@Req() req: Request) {
    return this.audit.startScan(req.staff!);
  }

  @Get("link-scans/:id")
  scan(@Param("id") id: string) {
    return this.audit.getScan(id);
  }
}
