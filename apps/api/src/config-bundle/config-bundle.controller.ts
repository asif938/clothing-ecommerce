import { Body, Controller, Get, HttpCode, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
import { CONFIG_BUNDLE_SECTIONS, CONFIG_BUNDLE_SECTION_KEYS } from "@clothing/shared/analytics";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ConfigBundleService } from "./config-bundle.service";

const sectionsParam = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [...CONFIG_BUNDLE_SECTION_KEYS]))
  .pipe(z.array(z.enum(CONFIG_BUNDLE_SECTION_KEYS)).min(1));
const exportQuerySchema = z.object({ sections: sectionsParam });

const importSchema = z.object({
  bundle: z.unknown(),
  sections: z.array(z.enum(CONFIG_BUNDLE_SECTION_KEYS)).min(1),
  dryRun: z.boolean().default(true),
  publishPages: z.boolean().default(false),
});

/** Config bundle export/import for onboarding a new brand (§16 M17). The import route has a raised JSON body limit (see main.ts). */
@ApiTags("config-bundle")
@Controller("admin/config-bundle")
@UseGuards(StaffAuthGuard, PermissionsGuard)
export class ConfigBundleController {
  constructor(private readonly bundles: ConfigBundleService) {}

  @Get("sections")
  @RequirePermissions("config_bundle.export")
  sections() {
    return CONFIG_BUNDLE_SECTIONS;
  }

  @Get("export")
  @RequirePermissions("config_bundle.export")
  async export(@Query(new ZodValidationPipe(exportQuerySchema)) query: z.infer<typeof exportQuerySchema>, @Req() req: Request, @Res() res: Response) {
    const bundle = await this.bundles.export(query.sections, req.staff!);
    res.header("Content-Type", "application/json").header("Content-Disposition", 'attachment; filename="config-bundle.json"').send(JSON.stringify(bundle, null, 2));
  }

  /** `dryRun` (the default) reports what would change; send `dryRun: false` to apply. */
  @Post("import")
  @HttpCode(200)
  @RequirePermissions("config_bundle.import")
  import(@Body(new ZodValidationPipe(importSchema)) body: z.infer<typeof importSchema>, @Req() req: Request) {
    return this.bundles.import(body.bundle, { sections: body.sections, dryRun: body.dryRun, publishPages: body.publishPages }, req.staff!, { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });
  }
}
