import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JourneysService } from "./journeys.service";
import { BroadcastsService } from "./broadcasts.service";
import { AudienceSyncService } from "./audience-sync.service";
import { AdSpendService } from "./ad-spend.service";
import { PromoCalendarService } from "./promo-calendar.service";
import {
  adSpendImportSchema,
  adSpendInspectSchema,
  audienceSyncSchema,
  audienceSyncUpdateSchema,
  broadcastSchema,
  dateRangeSchema,
  journeyActiveSchema,
  journeySchema,
  scheduleBroadcastSchema,
  testSendSchema,
  type AdSpendImportDto,
  type AdSpendInspectDto,
  type AudienceSyncDto,
  type AudienceSyncUpdateDto,
  type BroadcastDto,
  type DateRangeDto,
  type JourneyActiveDto,
  type JourneyDto,
  type ScheduleBroadcastDto,
  type TestSendDto,
} from "./dto";

@ApiTags("marketing")
@Controller("admin/marketing/journeys")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("marketing.journeys.manage")
export class JourneysController {
  constructor(private readonly journeys: JourneysService) {}

  @Get()
  list() {
    return this.journeys.list();
  }

  @Post("starters")
  starters(@Req() req: Request) {
    return this.journeys.createStarters(req.staff!);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.journeys.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(journeySchema)) body: JourneyDto, @Req() req: Request) {
    return this.journeys.create(body, req.staff!);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(journeySchema)) body: JourneyDto, @Req() req: Request) {
    return this.journeys.update(id, body, req.staff!);
  }

  @Patch(":id/active")
  setActive(@Param("id") id: string, @Body(new ZodValidationPipe(journeyActiveSchema)) body: JourneyActiveDto, @Req() req: Request) {
    return this.journeys.setActive(id, body.isActive, req.staff!);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.journeys.remove(id, req.staff!);
  }
}

@ApiTags("marketing")
@Controller("admin/marketing/broadcasts")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("marketing.broadcasts.manage")
export class BroadcastsController {
  constructor(private readonly broadcasts: BroadcastsService) {}

  @Get()
  list() {
    return this.broadcasts.list();
  }

  /** Cost/recipient estimate for an unsaved draft, as the composer types. */
  @Post("estimate")
  @HttpCode(200)
  estimate(@Body(new ZodValidationPipe(broadcastSchema)) body: BroadcastDto) {
    return this.broadcasts.estimate({ channel: body.channel, segmentId: body.segmentId ?? null, bodyBn: body.bodyBn, bodyEn: body.bodyEn });
  }

  @Get(":id")
  report(@Param("id") id: string) {
    return this.broadcasts.report(id);
  }

  @Get(":id/preview")
  preview(@Param("id") id: string) {
    return this.broadcasts.preview(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(broadcastSchema)) body: BroadcastDto, @Req() req: Request) {
    return this.broadcasts.create(body, req.staff!);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(broadcastSchema)) body: BroadcastDto, @Req() req: Request) {
    return this.broadcasts.update(id, body, req.staff!);
  }

  @Post(":id/test")
  @HttpCode(200)
  test(@Param("id") id: string, @Body(new ZodValidationPipe(testSendSchema)) body: TestSendDto) {
    return this.broadcasts.testSend(id, body);
  }

  @Post(":id/schedule")
  @HttpCode(200)
  @RequirePermissions("marketing.broadcasts.manage", "marketing.broadcasts.send")
  schedule(@Param("id") id: string, @Body(new ZodValidationPipe(scheduleBroadcastSchema)) body: ScheduleBroadcastDto, @Req() req: Request) {
    return this.broadcasts.schedule(id, body, req.staff!);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @RequirePermissions("marketing.broadcasts.manage", "marketing.broadcasts.send")
  cancel(@Param("id") id: string, @Req() req: Request) {
    return this.broadcasts.cancel(id, req.staff!);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.broadcasts.remove(id, req.staff!);
  }
}

@ApiTags("marketing")
@Controller("admin/marketing/audiences")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("marketing.audiences.manage")
export class AudiencesController {
  constructor(private readonly audiences: AudienceSyncService) {}

  @Get()
  list() {
    return this.audiences.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(audienceSyncSchema)) body: AudienceSyncDto, @Req() req: Request) {
    return this.audiences.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(audienceSyncUpdateSchema)) body: AudienceSyncUpdateDto, @Req() req: Request) {
    return this.audiences.setAutoSync(id, body.autoSync, req.staff!);
  }

  @Post(":id/sync")
  @HttpCode(200)
  sync(@Param("id") id: string, @Req() req: Request) {
    return this.audiences.startSync(id, req.staff!);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.audiences.remove(id, req.staff!);
  }
}

@ApiTags("marketing")
@Controller("admin/marketing/ad-spend")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("marketing.ad_spend.manage")
export class AdSpendController {
  constructor(private readonly adSpend: AdSpendService) {}

  @Get()
  list(@Query(new ZodValidationPipe(dateRangeSchema)) query: DateRangeDto) {
    return this.adSpend.list(query);
  }

  @Get("roas")
  roas(@Query(new ZodValidationPipe(dateRangeSchema)) query: DateRangeDto) {
    return this.adSpend.roas(query);
  }

  @Post("inspect")
  @HttpCode(200)
  inspect(@Body(new ZodValidationPipe(adSpendInspectSchema)) body: AdSpendInspectDto) {
    return this.adSpend.inspect(body);
  }

  @Post("import")
  import(@Body(new ZodValidationPipe(adSpendImportSchema)) body: AdSpendImportDto, @Req() req: Request) {
    return this.adSpend.import(body, req.staff!);
  }

  @Delete("batches/:batch")
  removeBatch(@Param("batch") batch: string, @Req() req: Request) {
    return this.adSpend.removeBatch(batch, req.staff!);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.adSpend.remove(id, req.staff!);
  }
}

@ApiTags("marketing")
@Controller("admin/marketing/calendar")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("marketing.calendar.read")
export class PromoCalendarController {
  constructor(private readonly calendar: PromoCalendarService) {}

  @Get()
  events(@Query(new ZodValidationPipe(dateRangeSchema)) query: DateRangeDto) {
    return this.calendar.events(query.from, query.to);
  }
}
