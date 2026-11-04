import { Injectable, NotFoundException } from "@nestjs/common";
import type { NotificationChannel as PrismaNotificationChannel, NotificationEvent as PrismaNotificationEvent } from "@clothing/db";
import { NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS, estimateSmsLength, type NotificationChannel } from "@clothing/shared/notifications";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { NotificationDriversService } from "./notification-drivers.service";
import { NotificationsService } from "./notifications.service";
import type { PreviewTemplateDto, TestSendDto, UpdateMessageTemplateDto } from "./dto";

const SAMPLE_VARIABLES: Record<string, string> = {
  brand_name: "Demo Fashion",
  support_phone: "01700-000000",
  customer_name: "Rahim Uddin",
  order_number: "DEM2611040001",
  order_total: "৳1,250",
  cod_amount: "৳500",
  tracking_code: "TRK-998877",
  tracking_link: "https://example.test/track/DEM2611040001",
  courier_name: "Steadfast",
  otp: "123456",
};

function isNotificationEventKey(key: string): boolean {
  return NOTIFICATION_EVENTS.some((e) => e.key === key);
}

@Injectable()
export class NotificationTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly drivers: NotificationDriversService,
    private readonly notifications: NotificationsService,
  ) {}

  async list() {
    const rows = await this.prisma.messageTemplate.findMany();
    const byEventChannel = new Map(rows.map((r) => [`${r.event}:${r.channel}`, r]));
    const costPerSegment = await this.settings.getValue<number>("notifications.smsCostPerSegmentPoisha");

    return NOTIFICATION_EVENTS.map((event) => ({
      event: event.key,
      label: event.label,
      help: event.help,
      variables: event.variables,
      defaultChannelOrder: event.defaultChannelOrder,
      templates: Object.fromEntries(
        NOTIFICATION_CHANNELS.map((channel) => {
          const row = byEventChannel.get(`${event.key}:${channel}`);
          const smsEstimate = channel === "sms" && row ? estimateSmsLength(row.bodyBn) : null;
          return [
            channel,
            row
              ? {
                  id: row.id,
                  isActive: row.isActive,
                  subjectBn: row.subjectBn,
                  subjectEn: row.subjectEn,
                  bodyBn: row.bodyBn,
                  bodyEn: row.bodyEn,
                  smsEstimate: smsEstimate ? { ...smsEstimate, costPoisha: smsEstimate.segments * costPerSegment } : null,
                }
              : null,
          ];
        }),
      ),
    }));
  }

  async update(event: string, channel: NotificationChannel, dto: UpdateMessageTemplateDto) {
    if (!isNotificationEventKey(event)) throw new NotFoundException(`Unknown notification event "${event}"`);
    return this.prisma.messageTemplate.upsert({
      where: { event_channel: { event: event as PrismaNotificationEvent, channel: channel as PrismaNotificationChannel } },
      update: dto,
      create: {
        event: event as PrismaNotificationEvent,
        channel: channel as PrismaNotificationChannel,
        isActive: dto.isActive ?? true,
        subjectBn: dto.subjectBn ?? null,
        subjectEn: dto.subjectEn ?? null,
        bodyBn: dto.bodyBn ?? "",
        bodyEn: dto.bodyEn ?? "",
      },
    });
  }

  async preview(dto: PreviewTemplateDto) {
    const variables = { ...SAMPLE_VARIABLES, ...(await this.notifications.commonVariables()) };
    const rendered = await this.notifications.renderForChannel(this.prisma, dto.event, dto.channel, dto.locale, variables);
    if (!rendered) return { subject: null, body: null, smsEstimate: null };
    const smsEstimate = dto.channel === "sms" ? estimateSmsLength(rendered.body) : null;
    const costPerSegment = smsEstimate ? await this.settings.getValue<number>("notifications.smsCostPerSegmentPoisha") : 0;
    return {
      subject: rendered.subject,
      body: rendered.body,
      smsEstimate: smsEstimate ? { ...smsEstimate, costPoisha: smsEstimate.segments * costPerSegment } : null,
    };
  }

  async testSend(dto: TestSendDto) {
    const variables = { ...SAMPLE_VARIABLES, ...(await this.notifications.commonVariables()) };
    const rendered = await this.notifications.renderForChannel(this.prisma, dto.event, dto.channel, dto.locale, variables);
    if (!rendered) throw new NotFoundException(`No active template for event "${dto.event}" on channel "${dto.channel}"`);

    try {
      const { driverName } = await this.drivers.send(dto.channel, dto.to, rendered.subject, rendered.body);
      await this.notifications.logImmediate({
        event: dto.event,
        channel: dto.channel,
        recipientType: "guest",
        to: dto.to,
        locale: dto.locale,
        subject: rendered.subject,
        body: rendered.body,
        status: "sent",
        driver: driverName,
      });
      return { ok: true, driver: driverName };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await this.notifications.logImmediate({
        event: dto.event,
        channel: dto.channel,
        recipientType: "guest",
        to: dto.to,
        locale: dto.locale,
        subject: rendered.subject,
        body: rendered.body,
        status: "failed",
        lastError: message,
      });
      return { ok: false, error: message };
    }
  }
}
