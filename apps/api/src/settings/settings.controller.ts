import { Body, Controller, Get, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { listSettingGroups } from "@clothing/shared/settings";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { updateSettingSchema, type UpdateSettingDto } from "./dto";
import { SettingsService } from "./settings.service";

/**
 * Generated admin Settings UI (§4.1): the frontend renders this metadata —
 * it never needs a custom screen when a new setting is added to the registry.
 */
@ApiTags("settings")
@Controller("admin/settings")
@UseGuards(StaffAuthGuard, PermissionsGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermissions("settings.read")
  async list() {
    const all = await this.settings.getAllWithMetadata();
    return {
      groups: listSettingGroups(),
      settings: all.map(({ definition, value, isOverridden }) => ({
        key: definition.key,
        group: definition.group,
        label: definition.label,
        help: definition.help ?? null,
        secret: Boolean(definition.secret),
        public: Boolean(definition.public),
        permission: definition.permission,
        ui: definition.ui,
        value,
        isOverridden,
      })),
    };
  }

  // No @RequirePermissions here: each setting declares its own write
  // permission (they differ per group), so SettingsService checks it itself.
  @Patch(":key")
  async update(@Param("key") key: string, @Body(new ZodValidationPipe(updateSettingSchema)) body: UpdateSettingDto, @Req() req: Request) {
    await this.settings.setValue(key, body.value, req.staff!, { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });
    return { ok: true };
  }
}
