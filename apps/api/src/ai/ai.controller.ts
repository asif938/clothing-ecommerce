import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AiFeature } from "@clothing/shared/ai";
import { AiService, monthKey } from "./ai.service";
import { AiDraftsService } from "./ai-drafts.service";
import {
  aiFeatureParamSchema,
  generateProductDraftSchema,
  restoreVersionSchema,
  updateAiConfigSchema,
  updateDraftSchema,
  usageQuerySchema,
  type GenerateProductDraftDto,
  type RestoreVersionDto,
  type UpdateAiConfigDto,
  type UpdateDraftDto,
  type UsageQueryDto,
} from "./dto";

@ApiTags("ai")
@Controller("admin/ai")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("ai.manage")
export class AiAdminController {
  constructor(private readonly ai: AiService) {}

  @Get("features")
  features() {
    return this.ai.listConfigs();
  }

  @Put("features/:feature")
  update(@Param("feature", new ZodValidationPipe(aiFeatureParamSchema)) feature: AiFeature, @Body(new ZodValidationPipe(updateAiConfigSchema)) body: UpdateAiConfigDto, @Req() req: Request) {
    return this.ai.updateConfig(feature, body, req.staff!);
  }

  @Get("features/:feature/versions")
  versions(@Param("feature", new ZodValidationPipe(aiFeatureParamSchema)) feature: AiFeature) {
    return this.ai.versions(feature);
  }

  @Post("features/:feature/restore")
  @HttpCode(200)
  restore(@Param("feature", new ZodValidationPipe(aiFeatureParamSchema)) feature: AiFeature, @Body(new ZodValidationPipe(restoreVersionSchema)) body: RestoreVersionDto, @Req() req: Request) {
    return this.ai.restoreVersion(feature, body.version, req.staff!);
  }

  @Get("usage")
  usage(@Query(new ZodValidationPipe(usageQuerySchema)) query: UsageQueryDto) {
    return this.ai.usageReport(query.month ?? monthKey());
  }
}

/** Generating and reviewing drafts needs `ai.use` (to call the AI) plus `catalog.manage` (it's product content). */
@ApiTags("ai")
@Controller("admin/ai")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("ai.use", "catalog.manage")
export class AiDraftsController {
  constructor(private readonly drafts: AiDraftsService) {}

  @Post("products/:productId/drafts")
  generate(@Param("productId") productId: string, @Body(new ZodValidationPipe(generateProductDraftSchema)) body: GenerateProductDraftDto, @Req() req: Request) {
    return this.drafts.generateForProduct(productId, body, req.staff!);
  }

  @Get("products/:productId/drafts")
  list(@Param("productId") productId: string) {
    return this.drafts.listForProduct(productId);
  }

  @Patch("drafts/:id")
  updateDraft(@Param("id") id: string, @Body(new ZodValidationPipe(updateDraftSchema)) body: UpdateDraftDto) {
    return this.drafts.updateOutput(id, body.output);
  }

  @Post("drafts/:id/apply")
  @HttpCode(200)
  apply(@Param("id") id: string, @Req() req: Request) {
    return this.drafts.apply(id, req.staff!);
  }

  @Post("drafts/:id/discard")
  @HttpCode(200)
  discard(@Param("id") id: string, @Req() req: Request) {
    return this.drafts.discard(id, req.staff!);
  }
}
