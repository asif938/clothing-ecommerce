import { Injectable } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackEventDto } from "./dto";

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

/**
 * First-party analytics (docs/PROJECT_SPEC.md §13.3) — append-only, like
 * `audit_logs`. The funnel/live-dashboard reader and the Meta/GA4/TikTok
 * server-side relays are Phase 2 (M8) consumers of this same table; this
 * milestone only needs the events captured, not reported on yet.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async track(dto: TrackEventDto): Promise<void> {
    await this.prisma.analyticsEvent.create({
      data: { type: dto.type, payload: toJsonInput(dto.payload), anonymousId: dto.anonymousId ?? null, path: dto.path ?? null },
    });
  }
}
