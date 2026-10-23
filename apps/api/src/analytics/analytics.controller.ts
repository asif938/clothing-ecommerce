import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AnalyticsService } from "./analytics.service";
import { trackEventSchema, type TrackEventDto } from "./dto";

/** `POST /store/events` (docs/PROJECT_SPEC.md §11.2 "events: first-party analytics + CAPI relay") — the CAPI relay itself is M8; this just captures the event. */
@ApiTags("store")
@Controller("store/events")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post()
  @HttpCode(204)
  async track(@Body(new ZodValidationPipe(trackEventSchema)) body: TrackEventDto) {
    await this.analytics.track(body);
  }
}
