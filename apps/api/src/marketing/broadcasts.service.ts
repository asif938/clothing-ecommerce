import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Broadcast, Prisma } from "@clothing/db";
import { estimateBroadcastCost } from "@clothing/shared/marketing";
import type { NotificationChannel } from "@clothing/shared/notifications";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { SegmentsService } from "../customers/segments.service";
import type { AuthenticatedStaff } from "../common/types";
import { MarketingMessagingService, RECIPIENT_SELECT, toRecipient } from "./marketing-messaging.service";
import type { BroadcastDto, ScheduleBroadcastDto, TestSendDto } from "./dto";

/** Realistic-length stand-ins for per-recipient variables, so the SMS segment estimate isn't optimistic. */
const SAMPLE_VARIABLES = { customer_name: "Mohammad Rahman", coupon_code: "VIPAB12CD34", points_balance: "1250" };

/**
 * Marketing broadcasts (docs/PROJECT_SPEC.md §8.2 Marketing "Campaigns:
 * SMS/WhatsApp/email broadcasts to segments with preview, test send,
 * schedule, cost estimate, delivery report", §16 M13). Audience = a
 * segment's live members (or everyone) who are active, reachable on the
 * channel and have given marketing consent for it — consent is never
 * optional for broadcasts. Sending is a scheduler sweep that queues
 * `batchSize` recipients per tick into `notification_logs` (M7's dispatch
 * sends them), resuming from `cursor` so a restart never double-sends.
 */
@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger(BroadcastsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly segments: SegmentsService,
    private readonly messaging: MarketingMessagingService,
  ) {}

  /** Audience filter for a channel: active, not deleted, consented, reachable. */
  async audienceWhere(channel: NotificationChannel, segmentId: string | null): Promise<Prisma.CustomerWhereInput> {
    const clauses: Prisma.CustomerWhereInput[] = [{ deletedAt: null, status: "active" }];
    if (segmentId) clauses.push(this.segments.whereFor(await this.segments.get(segmentId)));
    if (channel === "sms") clauses.push({ marketingConsentSms: true, phone: { not: null } });
    else if (channel === "whatsapp") clauses.push({ marketingConsentWhatsapp: true, phone: { not: null } });
    else if (channel === "email") clauses.push({ marketingConsentEmail: true, email: { not: null } });
    else clauses.push({ pushSubscriptions: { some: {} } });
    return { AND: clauses };
  }

  private codeTag(broadcast: Pick<Broadcast, "id" | "codePrefix">): string {
    return `${broadcast.codePrefix ?? "B"}${broadcast.id.slice(-3).toUpperCase()}`;
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  list() {
    return this.prisma.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  }

  async get(id: string) {
    const broadcast = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) throw new NotFoundException({ code: "BROADCAST_NOT_FOUND", message: "Broadcast not found" });
    return broadcast;
  }

  private async validate(dto: BroadcastDto): Promise<void> {
    if (dto.segmentId) await this.segments.get(dto.segmentId);
    if (dto.discountId) await this.messaging.assertCodeDiscount(dto.discountId);
  }

  private data(dto: BroadcastDto) {
    return {
      name: dto.name,
      channel: dto.channel,
      segmentId: dto.segmentId ?? null,
      subjectBn: dto.subjectBn ?? null,
      subjectEn: dto.subjectEn ?? null,
      bodyBn: dto.bodyBn,
      bodyEn: dto.bodyEn,
      discountId: dto.discountId ?? null,
      codePrefix: dto.codePrefix ?? null,
    };
  }

  async create(dto: BroadcastDto, actor: AuthenticatedStaff) {
    await this.validate(dto);
    const broadcast = await this.prisma.broadcast.create({ data: { ...this.data(dto), createdBy: actor.id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "broadcast.create", entityType: "broadcast", entityId: broadcast.id, after: broadcast });
    return broadcast;
  }

  async update(id: string, dto: BroadcastDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    if (before.status !== "draft") throw new BadRequestException({ code: "NOT_DRAFT", message: "Only drafts can be edited — cancel the schedule first." });
    await this.validate(dto);
    const broadcast = await this.prisma.broadcast.update({ where: { id }, data: this.data(dto) });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "broadcast.update", entityType: "broadcast", entityId: id, before, after: broadcast });
    return broadcast;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    if (before.status === "sending") throw new BadRequestException({ code: "SENDING", message: "Cancel the broadcast before deleting it." });
    await this.prisma.broadcast.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "broadcast.delete", entityType: "broadcast", entityId: id, before });
  }

  // ---------------------------------------------------------------------------
  // Estimate / preview / test
  // ---------------------------------------------------------------------------

  async estimate(input: Pick<Broadcast, "channel" | "segmentId" | "bodyBn" | "bodyEn">) {
    const where = await this.audienceWhere(input.channel, input.segmentId);
    const [en, total, rates, common] = await Promise.all([
      this.prisma.customer.count({ where: { AND: [where, { locale: "en" }] } }),
      this.prisma.customer.count({ where }),
      Promise.all([
        this.settings.getValue<number>("marketing.costs.smsPerSegment"),
        this.settings.getValue<number>("marketing.costs.whatsappPerMessage"),
        this.settings.getValue<number>("marketing.costs.emailPerMessage"),
      ]),
      this.messaging.baseVariables({ id: "sample", name: SAMPLE_VARIABLES.customer_name, phone: null, email: null, locale: "bn", pointsBalance: 1250, marketingConsentSms: true, marketingConsentEmail: true, marketingConsentWhatsapp: true, hasPush: false }),
    ]);
    const variables = { ...common, ...SAMPLE_VARIABLES };
    const bodies = { bn: this.messaging.render(input, "bn", variables).body, en: this.messaging.render(input, "en", variables).body };
    const estimate = estimateBroadcastCost({ channel: input.channel, recipients: { bn: total - en, en }, bodies }, { smsPerSegment: rates[0], whatsappPerMessage: rates[1], emailPerMessage: rates[2] });
    return { ...estimate, samples: bodies };
  }

  async preview(id: string) {
    const broadcast = await this.get(id);
    const where = await this.audienceWhere(broadcast.channel, broadcast.segmentId);
    const sample = await this.prisma.customer.findFirst({ where, select: RECIPIENT_SELECT, orderBy: { id: "asc" } });
    const recipient = sample ? toRecipient(sample) : null;
    const variables = { ...(await this.messaging.baseVariables(recipient ?? { id: "sample", name: SAMPLE_VARIABLES.customer_name, phone: null, email: null, locale: "bn", pointsBalance: 0, marketingConsentSms: false, marketingConsentEmail: false, marketingConsentWhatsapp: false, hasPush: false })), coupon_code: broadcast.discountId ? `${this.codeTag(broadcast)}XXXXXX` : "" };
    return {
      recipient: recipient ? { name: recipient.name, locale: recipient.locale } : null,
      bn: this.messaging.render(broadcast, "bn", variables),
      en: this.messaging.render(broadcast, "en", variables),
      estimate: await this.estimate(broadcast),
    };
  }

  async testSend(id: string, dto: TestSendDto) {
    const broadcast = await this.get(id);
    const variables = { ...(await this.messaging.baseVariables({ id: "test", name: SAMPLE_VARIABLES.customer_name, phone: null, email: null, locale: dto.locale, pointsBalance: 0, marketingConsentSms: true, marketingConsentEmail: true, marketingConsentWhatsapp: true, hasPush: false })), coupon_code: broadcast.discountId ? "TESTCODE" : "" };
    return this.messaging.sendTest(broadcast.channel, dto.to, broadcast, dto.locale, variables);
  }

  // ---------------------------------------------------------------------------
  // Schedule / cancel
  // ---------------------------------------------------------------------------

  async schedule(id: string, dto: ScheduleBroadcastDto, actor: AuthenticatedStaff) {
    if (!(await this.settings.getValue<boolean>("marketing.broadcasts.enabled"))) throw new BadRequestException({ code: "BROADCASTS_DISABLED", message: "Broadcasts are turned off in Settings → marketing." });
    const before = await this.get(id);
    if (before.status !== "draft") throw new BadRequestException({ code: "NOT_DRAFT", message: "This broadcast was already scheduled or sent." });
    const estimate = await this.estimate(before);
    if (estimate.recipients === 0) throw new BadRequestException({ code: "NO_RECIPIENTS", message: "Nobody in this audience can receive this channel (check consent and contact details)." });
    const broadcast = await this.prisma.broadcast.update({
      where: { id },
      data: { status: "scheduled", scheduledAt: dto.scheduledAt ?? new Date(), recipientEstimate: estimate.recipients, estimatedCost: estimate.totalCost },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "broadcast.schedule", entityType: "broadcast", entityId: id, before, after: { status: broadcast.status, scheduledAt: broadcast.scheduledAt, recipients: estimate.recipients, estimatedCost: estimate.totalCost } });
    return broadcast;
  }

  async cancel(id: string, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    if (before.status !== "scheduled" && before.status !== "sending") throw new BadRequestException({ code: "NOT_CANCELLABLE", message: "Only scheduled or sending broadcasts can be cancelled." });
    const broadcast = await this.prisma.$transaction(async (tx) => {
      const row = await tx.broadcast.update({ where: { id }, data: { status: before.status === "scheduled" ? "draft" : "cancelled", ...(before.status === "scheduled" ? { scheduledAt: null } : { completedAt: new Date() }) } });
      // Messages already queued but not yet handed to a provider are withdrawn too.
      await tx.notificationLog.updateMany({ where: { relatedEntityType: "broadcast", relatedEntityId: id, status: { in: ["queued", "retrying"] } }, data: { status: "failed", lastError: "Broadcast cancelled", nextAttemptAt: null } });
      return row;
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "broadcast.cancel", entityType: "broadcast", entityId: id, before: { status: before.status }, after: { status: broadcast.status } });
    return broadcast;
  }

  // ---------------------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------------------

  async processSweep(now = new Date()): Promise<{ queued: number }> {
    if (!(await this.settings.getValue<boolean>("marketing.broadcasts.enabled"))) return { queued: 0 };
    await this.prisma.broadcast.updateMany({ where: { status: "scheduled", scheduledAt: { lte: now } }, data: { status: "sending", startedAt: now } });
    const sending = await this.prisma.broadcast.findMany({ where: { status: "sending" }, orderBy: { startedAt: "asc" } });
    const batchSize = await this.settings.getValue<number>("marketing.broadcasts.batchSize");
    let queued = 0;
    for (const broadcast of sending) {
      try {
        queued += await this.sendBatch(broadcast, batchSize);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        this.logger.error(`Broadcast ${broadcast.id} batch failed: ${message}`);
        await this.prisma.broadcast.update({ where: { id: broadcast.id }, data: { lastError: message } });
      }
    }
    return { queued };
  }

  private async sendBatch(broadcast: Broadcast, batchSize: number): Promise<number> {
    const where = await this.audienceWhere(broadcast.channel, broadcast.segmentId);
    const rows = await this.prisma.customer.findMany({
      where: { AND: [where, ...(broadcast.cursor ? [{ id: { gt: broadcast.cursor } }] : [])] },
      select: RECIPIENT_SELECT,
      orderBy: { id: "asc" },
      take: batchSize,
    });
    const tag = this.codeTag(broadcast);
    let queued = 0;
    await this.prisma.$transaction(
      async (tx) => {
        for (const row of rows) {
          const recipient = toRecipient(row);
          const variables: Record<string, string> = { ...(await this.messaging.baseVariables(recipient)) };
          if (broadcast.discountId) variables.coupon_code = await this.messaging.mintPersonalCode(tx, broadcast.discountId, tag, recipient.id);
          await this.messaging.queue(tx, { event: "marketing_broadcast", channel: broadcast.channel, recipient, copy: broadcast, variables, related: { type: "broadcast", id: broadcast.id } });
          queued += 1;
        }
        const done = rows.length < batchSize;
        // Guarded on status so a cancel that landed mid-batch isn't overwritten.
        await tx.broadcast.updateMany({
          where: { id: broadcast.id, status: "sending" },
          data: { cursor: rows.at(-1)?.id ?? broadcast.cursor, queuedCount: { increment: queued }, ...(done ? { status: "sent", completedAt: new Date() } : {}) },
        });
      },
      { timeout: 120_000 },
    );
    return queued;
  }

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  async report(id: string) {
    const broadcast = await this.get(id);
    const [byStatus, codes] = await Promise.all([
      this.prisma.notificationLog.groupBy({ by: ["status"], where: { relatedEntityType: "broadcast", relatedEntityId: id }, _count: { _all: true } }),
      broadcast.discountId ? this.codeStats(broadcast) : Promise.resolve(null),
    ]);
    const delivery = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Record<string, number>;
    return { broadcast, delivery, codes };
  }

  private async codeStats(broadcast: Broadcast) {
    const prefix = this.codeTag(broadcast);
    const [issued, redeemed, usage] = await Promise.all([
      this.prisma.discountCode.count({ where: { discountId: broadcast.discountId!, code: { startsWith: prefix } } }),
      this.prisma.discountCode.count({ where: { discountId: broadcast.discountId!, code: { startsWith: prefix }, usedCount: { gt: 0 } } }),
      this.prisma.discountUsage.findMany({ where: { discountId: broadcast.discountId!, code: { startsWith: prefix } }, select: { amount: true, order: { select: { total: true, status: true } } } }),
    ]);
    const live = usage.filter((u) => u.order.status !== "cancelled" && u.order.status !== "expired");
    return { prefix, issued, redeemed, discountGiven: live.reduce((s, u) => s + u.amount, 0), orderRevenue: live.reduce((s, u) => s + u.order.total, 0) };
  }
}
