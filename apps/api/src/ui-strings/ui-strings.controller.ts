import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RevalidationService } from "../revalidation/revalidation.service";
import { updateUiStringSchema, type UpdateUiStringDto } from "./dto";
import { STOREFRONT_UI_STRING_PREFIX } from "./store-ui-strings.controller";

/** The admin "UI Text" screen (docs/PROJECT_SPEC.md §4.5) — search + inline edit over `ui_strings`. */
@ApiTags("ui-strings")
@Controller("admin/ui-strings")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("ui_strings.manage")
export class UiStringsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  @Get()
  async list(@Query("search") search?: string) {
    return await this.prisma.uiString.findMany({
      where: search
        ? {
            OR: [
              { key: { contains: search, mode: "insensitive" } },
              { bn: { contains: search, mode: "insensitive" } },
              { en: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { key: "asc" },
    });
  }

  @Patch(":key")
  async update(@Param("key") key: string, @Body(new ZodValidationPipe(updateUiStringSchema)) body: UpdateUiStringDto, @Req() req: Request) {
    const before = await this.prisma.uiString.findUnique({ where: { key } });
    const updated = await this.prisma.uiString.update({ where: { key }, data: body });
    await this.audit.record({
      actorType: "staff",
      actorId: req.staff!.id,
      action: "ui_string.update",
      entityType: "ui_string",
      entityId: key,
      before,
      after: updated,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    // Storefront chrome text is cached under this tag (GET /store/ui-strings).
    if (key.startsWith(STOREFRONT_UI_STRING_PREFIX)) await this.revalidation.revalidate(["ui_strings"]);
    return updated;
  }
}
