import { Injectable, NotFoundException } from "@nestjs/common";
import type { NotificationEvent as PrismaNotificationEvent } from "@clothing/db";
import { NOTIFICATION_EVENTS } from "@clothing/shared/notifications";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateChannelRuleDto } from "./dto";

@Injectable()
export class NotificationChannelRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.notificationChannelRule.findMany();
    const byEvent = new Map(rows.map((r) => [r.event, r]));
    return NOTIFICATION_EVENTS.map((event) => {
      const row = byEvent.get(event.key as PrismaNotificationEvent);
      return {
        event: event.key,
        label: event.label,
        channels: (row?.channels as string[] | undefined) ?? event.defaultChannelOrder,
        isCustomized: !!row,
      };
    });
  }

  async update(event: string, dto: UpdateChannelRuleDto) {
    if (!NOTIFICATION_EVENTS.some((e) => e.key === event)) {
      throw new NotFoundException(`Unknown notification event "${event}"`);
    }
    return this.prisma.notificationChannelRule.upsert({
      where: { event: event as PrismaNotificationEvent },
      update: { channels: dto.channels },
      create: { event: event as PrismaNotificationEvent, channels: dto.channels },
    });
  }
}
