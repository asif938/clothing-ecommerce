import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { RFM_SEGMENTS } from "@clothing/shared/marketing";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { RfmService } from "./rfm.service";

const presetsSchema = z.object({ segments: z.array(z.enum(RFM_SEGMENTS)).optional() });
type PresetsDto = z.infer<typeof presetsSchema>;

@ApiTags("customers")
@Controller("admin/crm/rfm")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("customers.manage")
export class RfmController {
  constructor(private readonly rfm: RfmService) {}

  @Get()
  summary() {
    return this.rfm.summary();
  }

  @Post("run")
  @HttpCode(200)
  run() {
    return this.rfm.score();
  }

  @Post("presets")
  presets(@Body(new ZodValidationPipe(presetsSchema)) body: PresetsDto, @Req() req: Request) {
    return this.rfm.createPresets(req.staff!, body.segments);
  }
}
