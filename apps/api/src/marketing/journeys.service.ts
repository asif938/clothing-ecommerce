import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, type Journey } from "@clothing/db";
import type { NotificationChannel } from "@clothing/shared/notifications";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { LoyaltyService } from "../loyalty/loyalty.service";
import { dhakaParts } from "../common/dhaka-time";
import type { AuthenticatedStaff } from "../common/types";
import { MarketingMessagingService, pickChannel, RECIPIENT_SELECT, toRecipient } from "./marketing-messaging.service";
import { journeyConfigSchema, journeyStepSchema, type JourneyConfig, type JourneyDto, type JourneyStep } from "./dto";

const BATCH = 200;
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_WIN_BACK_DAYS = 60;
const DEFAULT_MAX_INACTIVE_DAYS = 365;
const DEFAULT_BIRTHDAY_HOUR = 10;

function steps(journey: Pick<Journey, "steps">): JourneyStep[] {
  return journeyStepSchema.array().parse(journey.steps);
}

function config(journey: Pick<Journey, "config">): JourneyConfig {
  return journeyConfigSchema.parse(journey.config ?? {});
}

/**
 * Automated journeys (docs/PROJECT_SPEC.md §8.2 Marketing "Automated
 * journeys (welcome, post-purchase review request, win-back, birthday)",
 * §16 M13). Two cheap recurring sweeps, like every other sweep here:
 *
 *  1. `enrollSweep()` finds customers who newly match an active journey's
 *     trigger and enrols them once per trigger context (unique key), so
 *     re-runs are harmless. Only triggers that happen *after* a journey is
 *     activated count (win-back and birthday are states, not events, so they
 *     apply to whoever matches from then on).
 *  2. `runDue()` sends each enrolment's next step when it's due. Step 1's
 *     delay counts from the trigger; later steps' delays count from the
 *     previous step. Win-back enrolments exit as soon as the customer orders.
 */
@Injectable()
export class JourneysService {
  private readonly logger = new Logger(JourneysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly loyalty: LoyaltyService,
    private readonly messaging: MarketingMessagingService,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async list() {
    const journeys = await this.prisma.journey.findMany({ orderBy: { createdAt: "asc" } });
    const counts = await this.prisma.journeyEnrollment.groupBy({ by: ["journeyId", "status"], _count: { _all: true } });
    return journeys.map((j) => ({
      ...j,
      stats: Object.fromEntries(counts.filter((c) => c.journeyId === j.id).map((c) => [c.status, c._count._all])) as Record<string, number>,
    }));
  }

  async get(id: string) {
    const journey = await this.prisma.journey.findUnique({ where: { id } });
    if (!journey) throw new NotFoundException({ code: "JOURNEY_NOT_FOUND", message: "Journey not found" });
    const [recent, sent] = await Promise.all([
      this.prisma.journeyEnrollment.findMany({ where: { journeyId: id }, orderBy: { updatedAt: "desc" }, take: 50, include: { customer: { select: { name: true, phone: true } } } }),
      this.prisma.notificationLog.groupBy({ by: ["status"], where: { relatedEntityType: "journey", relatedEntityId: id }, _count: { _all: true } }),
    ]);
    return { ...journey, recent, delivery: Object.fromEntries(sent.map((s) => [s.status, s._count._all])) };
  }

  private async assertCoupons(dto: JourneyDto): Promise<void> {
    for (const step of dto.steps) if (step.couponDiscountId) await this.messaging.assertCodeDiscount(step.couponDiscountId);
  }

  async create(dto: JourneyDto, actor: AuthenticatedStaff) {
    await this.assertCoupons(dto);
    const journey = await this.prisma.journey.create({ data: { name: dto.name, type: dto.type, respectConsent: dto.respectConsent, config: dto.config as Prisma.InputJsonValue, steps: dto.steps as Prisma.InputJsonValue } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "journey.create", entityType: "journey", entityId: journey.id, after: journey });
    return journey;
  }

  async update(id: string, dto: JourneyDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.journey.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: "JOURNEY_NOT_FOUND", message: "Journey not found" });
    if (before.type !== dto.type) throw new BadRequestException({ code: "TYPE_LOCKED", message: "A journey's trigger can't change — create a new journey instead." });
    await this.assertCoupons(dto);
    const journey = await this.prisma.journey.update({ where: { id }, data: { name: dto.name, respectConsent: dto.respectConsent, config: dto.config as Prisma.InputJsonValue, steps: dto.steps as Prisma.InputJsonValue } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "journey.update", entityType: "journey", entityId: id, before, after: journey });
    return journey;
  }

  async setActive(id: string, isActive: boolean, actor: AuthenticatedStaff) {
    const before = await this.prisma.journey.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: "JOURNEY_NOT_FOUND", message: "Journey not found" });
    const journey = await this.prisma.journey.update({ where: { id }, data: { isActive, ...(isActive && !before.isActive ? { activatedAt: new Date() } : {}) } });
    if (!isActive) await this.prisma.journeyEnrollment.updateMany({ where: { journeyId: id, status: "active" }, data: { status: "exited", lastError: "Journey paused", nextRunAt: null } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: isActive ? "journey.activate" : "journey.pause", entityType: "journey", entityId: id, before: { isActive: before.isActive }, after: { isActive } });
    return journey;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.prisma.journey.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: "JOURNEY_NOT_FOUND", message: "Journey not found" });
    await this.prisma.journey.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "journey.delete", entityType: "journey", entityId: id, before });
  }

  /** Inactive starter journeys with default bilingual copy (spec §17-style seed values, all editable). Skips types that already exist. */
  async createStarters(actor: AuthenticatedStaff) {
    const existing = new Set((await this.prisma.journey.findMany({ select: { type: true } })).map((j) => j.type));
    const created = [];
    for (const starter of STARTER_JOURNEYS) {
      if (existing.has(starter.type)) continue;
      created.push(await this.create(starter, actor));
    }
    return created;
  }

  // ---------------------------------------------------------------------------
  // Sweeps
  // ---------------------------------------------------------------------------

  private async enroll(journey: Journey, customerId: string, contextKey: string, triggeredAt: Date, orderId: string | null = null): Promise<boolean> {
    const first = steps(journey)[0];
    if (!first) return false;
    try {
      await this.prisma.$transaction([
        this.prisma.journeyEnrollment.create({ data: { journeyId: journey.id, customerId, contextKey, orderId, nextRunAt: new Date(triggeredAt.getTime() + first.delayHours * HOUR_MS) } }),
        this.prisma.journey.update({ where: { id: journey.id }, data: { enrolledCount: { increment: 1 } } }),
      ]);
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  async enrollSweep(now = new Date()): Promise<{ enrolled: number }> {
    if (!(await this.settings.getValue<boolean>("marketing.journeys.enabled"))) return { enrolled: 0 };
    const journeys = await this.prisma.journey.findMany({ where: { isActive: true } });
    let enrolled = 0;
    for (const journey of journeys) {
      const since = journey.activatedAt ?? journey.updatedAt;
      const cfg = config(journey);
      if (journey.type === "welcome") {
        const customers = await this.prisma.customer.findMany({
          where: { createdAt: { gte: since }, deletedAt: null, status: "active", journeyEnrollments: { none: { journeyId: journey.id } } },
          select: { id: true, createdAt: true },
          take: BATCH,
        });
        for (const c of customers) if (await this.enroll(journey, c.id, "once", c.createdAt)) enrolled += 1;
      } else if (journey.type === "post_purchase") {
        const orders = await this.prisma.$queryRaw<{ id: string; customer_id: string; delivered_at: Date }[]>`
          SELECT o.id, o.customer_id, o.delivered_at FROM orders o
          WHERE o.customer_id IS NOT NULL AND o.delivered_at >= ${since}
            AND o.status::text IN ('delivered', 'partially_delivered', 'completed')
            AND NOT EXISTS (SELECT 1 FROM journey_enrollments e WHERE e.journey_id = ${journey.id} AND e.context_key = o.id)
          ORDER BY o.delivered_at LIMIT ${BATCH}`;
        for (const o of orders) if (await this.enroll(journey, o.customer_id, o.id, o.delivered_at, o.id)) enrolled += 1;
      } else if (journey.type === "win_back") {
        const lapsedBefore = new Date(now.getTime() - (cfg.winBackDays ?? DEFAULT_WIN_BACK_DAYS) * 24 * HOUR_MS);
        const notBefore = new Date(now.getTime() - (cfg.maxInactiveDays ?? DEFAULT_MAX_INACTIVE_DAYS) * 24 * HOUR_MS);
        const customers = await this.prisma.$queryRaw<{ id: string; last_order_at: Date }[]>`
          SELECT c.id, c.last_order_at FROM customers c
          WHERE c.deleted_at IS NULL AND c.status = 'active' AND c.last_order_at <= ${lapsedBefore} AND c.last_order_at >= ${notBefore}
            AND NOT EXISTS (SELECT 1 FROM journey_enrollments e WHERE e.journey_id = ${journey.id} AND e.customer_id = c.id AND e.context_key = to_char(c.last_order_at, 'YYYY-MM-DD'))
          LIMIT ${BATCH}`;
        for (const c of customers) if (await this.enroll(journey, c.id, c.last_order_at.toISOString().slice(0, 10), now)) enrolled += 1;
      } else if (journey.type === "birthday") {
        const { year, month, day, hour } = dhakaParts(now);
        if (hour < (cfg.sendHour ?? DEFAULT_BIRTHDAY_HOUR)) continue;
        for (const c of await this.loyalty.birthdaysOn(month + 1, day)) if (await this.enroll(journey, c.id, String(year), now)) enrolled += 1;
      }
    }
    return { enrolled };
  }

  async runDue(now = new Date()): Promise<{ sent: number; skipped: number }> {
    if (!(await this.settings.getValue<boolean>("marketing.journeys.enabled"))) return { sent: 0, skipped: 0 };
    const due = await this.prisma.journeyEnrollment.findMany({
      where: { status: "active", nextRunAt: { lte: now } },
      include: { journey: true, customer: { select: { ...RECIPIENT_SELECT, lastOrderAt: true, deletedAt: true, status: true } } },
      orderBy: { nextRunAt: "asc" },
      take: BATCH,
    });
    let sent = 0;
    let skipped = 0;
    for (const enrollment of due) {
      try {
        const outcome = await this.advance(enrollment, now);
        if (outcome === "sent") sent += 1;
        else skipped += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        this.logger.error(`Journey enrolment ${enrollment.id} failed: ${message}`);
        await this.prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "failed", lastError: message, nextRunAt: null } });
      }
    }
    return { sent, skipped };
  }

  private async advance(
    enrollment: Prisma.JourneyEnrollmentGetPayload<{ include: { journey: true; customer: { select: typeof RECIPIENT_SELECT & { lastOrderAt: true; deletedAt: true; status: true } } } }>,
    now: Date,
  ): Promise<"sent" | "skipped"> {
    const { journey, customer } = enrollment;
    const exit = (reason: string) => this.prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "exited", lastError: reason, nextRunAt: null } });

    if (!journey.isActive) return exit("Journey paused").then(() => "skipped" as const);
    if (customer.deletedAt || customer.status !== "active") return exit("Customer inactive").then(() => "skipped" as const);
    if (journey.type === "win_back" && customer.lastOrderAt && customer.lastOrderAt > enrollment.createdAt) return exit("Customer ordered again").then(() => "skipped" as const);

    const allSteps = steps(journey);
    const step = allSteps[enrollment.stepIndex];
    if (!step) {
      await this.prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { status: "completed", nextRunAt: null } });
      return "skipped";
    }

    const recipient = toRecipient(customer);
    const channel = pickChannel(step.channels as NotificationChannel[], recipient, journey.respectConsent);
    const next = allSteps[enrollment.stepIndex + 1];
    const advanceData = next ? { stepIndex: enrollment.stepIndex + 1, nextRunAt: new Date(now.getTime() + next.delayHours * HOUR_MS) } : { stepIndex: enrollment.stepIndex + 1, status: "completed" as const, nextRunAt: null };

    if (!channel) {
      // Unreachable on this step's channels (or no consent) — move on rather than block the rest of the journey.
      await this.prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: { ...advanceData, lastError: "No reachable channel with consent" } });
      return "skipped";
    }

    const variables: Record<string, string> = { ...(await this.messaging.baseVariables(recipient)) };
    if (enrollment.orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: enrollment.orderId }, select: { orderNumber: true } });
      variables.order_number = order?.orderNumber ?? "";
      variables.review_url = `${process.env.STOREFRONT_URL ?? ""}/account/orders/${enrollment.orderId}/reviews`;
    }

    await this.prisma.$transaction(async (tx) => {
      // Claim the step first so two overlapping ticks can't both send it.
      const claimed = await tx.journeyEnrollment.updateMany({ where: { id: enrollment.id, stepIndex: enrollment.stepIndex, status: "active" }, data: { ...advanceData, lastError: null } });
      if (claimed.count === 0) return;
      if (step.couponDiscountId) variables.coupon_code = await this.messaging.mintPersonalCode(tx, step.couponDiscountId, "J", customer.id);
      await this.messaging.queue(tx, { event: "journey_message", channel, recipient, copy: step, variables, related: { type: "journey", id: journey.id } });
    });
    return "sent";
  }
}

/** Starter copy — default seed values only (golden rule 1); staff edit or replace all of it. */
const STARTER_JOURNEYS: JourneyDto[] = [
  {
    name: "Welcome",
    type: "welcome",
    respectConsent: true,
    config: {},
    steps: [
      {
        delayHours: 1,
        channels: ["whatsapp", "sms", "email"],
        subjectBn: "{brand_name}-এ স্বাগতম",
        subjectEn: "Welcome to {brand_name}",
        bodyBn: "{customer_name}, {brand_name}-এ স্বাগতম! নতুন কালেকশন দেখুন: {shop_url}",
        bodyEn: "Hi {customer_name}, welcome to {brand_name}! See what's new: {shop_url}",
        couponDiscountId: null,
      },
    ],
  },
  {
    name: "Review request",
    type: "post_purchase",
    respectConsent: false,
    config: {},
    steps: [
      {
        delayHours: 72,
        channels: ["whatsapp", "sms", "email"],
        subjectBn: "আপনার অর্ডার {order_number} কেমন লাগলো?",
        subjectEn: "How was order {order_number}?",
        bodyBn: "{customer_name}, অর্ডার {order_number} কেমন লাগলো? একটি রিভিউ দিন: {review_url}",
        bodyEn: "Hi {customer_name}, how did you like order {order_number}? Leave a review: {review_url}",
        couponDiscountId: null,
      },
    ],
  },
  {
    name: "Win-back",
    type: "win_back",
    respectConsent: true,
    config: { winBackDays: 60, maxInactiveDays: 365 },
    steps: [
      {
        delayHours: 0,
        channels: ["whatsapp", "sms", "email"],
        subjectBn: "আপনাকে মিস করছি",
        subjectEn: "We miss you",
        bodyBn: "{customer_name}, অনেকদিন দেখা নেই! নতুন কালেকশন দেখুন: {shop_url}",
        bodyEn: "Hi {customer_name}, it's been a while! Come see what's new: {shop_url}",
        couponDiscountId: null,
      },
    ],
  },
  {
    name: "Birthday",
    type: "birthday",
    respectConsent: true,
    config: { sendHour: 10 },
    steps: [
      {
        delayHours: 0,
        channels: ["whatsapp", "sms", "email"],
        subjectBn: "শুভ জন্মদিন, {customer_name}!",
        subjectEn: "Happy birthday, {customer_name}!",
        bodyBn: "শুভ জন্মদিন, {customer_name}! {brand_name}-এর পক্ষ থেকে শুভেচ্ছা। {shop_url}",
        bodyEn: "Happy birthday, {customer_name}! Warm wishes from {brand_name}. {shop_url}",
        couponDiscountId: null,
      },
    ],
  },
];
