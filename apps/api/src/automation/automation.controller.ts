import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { automationRuleInputSchema, type AutomationRuleInput } from "@clothing/shared/automation";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AutomationRulesService } from "./automation-rules.service";
import { listRunsQuerySchema, setActiveSchema, testRuleSchema, type ListRunsQueryDto, type SetActiveDto, type TestRuleDto } from "./dto";

@ApiTags("automation")
@Controller("admin/automation")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("automation.manage")
export class AutomationController {
  constructor(private readonly rules: AutomationRulesService) {}

  @Get("rules")
  list() {
    return this.rules.list();
  }

  @Get("templates")
  templates() {
    return this.rules.templates();
  }

  @Get("fields")
  fields() {
    return this.rules.conditionFields();
  }

  @Get("runs")
  runs(@Query(new ZodValidationPipe(listRunsQuerySchema)) query: ListRunsQueryDto) {
    return this.rules.runs(query.ruleId, query.limit);
  }

  @Post("rules")
  create(@Body(new ZodValidationPipe(automationRuleInputSchema)) body: AutomationRuleInput, @Req() req: Request) {
    return this.rules.create(body, req.staff!);
  }

  @Post("templates/:key")
  fromTemplate(@Param("key") key: string, @Req() req: Request) {
    return this.rules.createFromTemplate(key, req.staff!);
  }

  @Post("test")
  @HttpCode(200)
  test(@Body(new ZodValidationPipe(testRuleSchema)) body: TestRuleDto) {
    return this.rules.test(body);
  }

  @Put("rules/:id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(automationRuleInputSchema)) body: AutomationRuleInput, @Req() req: Request) {
    return this.rules.update(id, body, req.staff!);
  }

  @Patch("rules/:id/active")
  setActive(@Param("id") id: string, @Body(new ZodValidationPipe(setActiveSchema)) body: SetActiveDto, @Req() req: Request) {
    return this.rules.setActive(id, body.isActive, req.staff!);
  }

  @Delete("rules/:id")
  @HttpCode(204)
  async remove(@Param("id") id: string, @Req() req: Request) {
    await this.rules.remove(id, req.staff!);
  }
}
