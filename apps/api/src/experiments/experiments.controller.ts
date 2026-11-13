import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { ExperimentsService } from "./experiments.service";
import { ExperimentAssignmentsService } from "./experiment-assignments.service";
import {
  clickSchema,
  completeExperimentSchema,
  createExperimentSchema,
  exposuresSchema,
  listExperimentsQuerySchema,
  updateExperimentSchema,
  type ClickDto,
  type CompleteExperimentDto,
  type CreateExperimentDto,
  type ExposuresDto,
  type ListExperimentsQueryDto,
  type UpdateExperimentDto,
} from "./dto";

/** A/B tests admin (§16 M14). Reading needs `experiments.read`; every change needs `experiments.manage` and is audited. */
@ApiTags("experiments")
@Controller("admin/experiments")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("experiments.read")
export class ExperimentsController {
  constructor(private readonly experiments: ExperimentsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listExperimentsQuerySchema)) query: ListExperimentsQueryDto) {
    return this.experiments.list(query.status);
  }

  @Get("targets")
  targets() {
    return this.experiments.targets();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.experiments.get(id);
  }

  @Get(":id/results")
  results(@Param("id") id: string) {
    return this.experiments.results(id);
  }

  @Post()
  @RequirePermissions("experiments.manage")
  create(@Body(new ZodValidationPipe(createExperimentSchema)) body: CreateExperimentDto, @Req() req: Request) {
    return this.experiments.create(body, req.staff!);
  }

  @Patch(":id")
  @RequirePermissions("experiments.manage")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateExperimentSchema)) body: UpdateExperimentDto, @Req() req: Request) {
    return this.experiments.update(id, body, req.staff!);
  }

  @Post(":id/start")
  @HttpCode(200)
  @RequirePermissions("experiments.manage")
  start(@Param("id") id: string, @Req() req: Request) {
    return this.experiments.start(id, req.staff!);
  }

  @Post(":id/pause")
  @HttpCode(200)
  @RequirePermissions("experiments.manage")
  pause(@Param("id") id: string, @Req() req: Request) {
    return this.experiments.pause(id, req.staff!);
  }

  @Post(":id/complete")
  @HttpCode(200)
  @RequirePermissions("experiments.manage")
  complete(@Param("id") id: string, @Body(new ZodValidationPipe(completeExperimentSchema)) body: CompleteExperimentDto, @Req() req: Request) {
    return this.experiments.complete(id, body, req.staff!);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("experiments.manage")
  async remove(@Param("id") id: string, @Req() req: Request) {
    await this.experiments.remove(id, req.staff!);
  }
}

/**
 * Storefront side (§16 M14). The visitor is always the API's own
 * `anonymous_id` cookie (CustomerContextGuard sets it on first contact);
 * variants are recomputed server-side, so a client can only say *which*
 * experiments it rendered, never which variant it got.
 */
@ApiTags("store")
@Controller("store/experiments")
@UseGuards(CustomerContextGuard)
export class StoreExperimentsController {
  constructor(private readonly assignments: ExperimentAssignmentsService) {}

  @Get("me")
  async me(@Req() req: Request) {
    return { assignments: await this.assignments.assignmentsFor(req.customerContext!.anonymousId) };
  }

  @Post("exposures")
  @HttpCode(204)
  async exposures(@Body(new ZodValidationPipe(exposuresSchema)) body: ExposuresDto, @Req() req: Request) {
    await this.assignments.recordExposures(req.customerContext!.anonymousId, body.experimentIds);
  }

  @Post("click")
  @HttpCode(204)
  async click(@Body(new ZodValidationPipe(clickSchema)) body: ClickDto, @Req() req: Request) {
    await this.assignments.recordGoal(req.customerContext!.anonymousId, "click", body.experimentId);
  }
}
