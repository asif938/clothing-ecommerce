import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, type LoyaltyReason } from "@clothing/db";
import { addMonths, computeEarnPoints, consumeLotsFifo, eligibleSpendForOrder, resolveTier, type LoyaltyRules } from "@clothing/shared/marketing";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { isUniqueViolation } from "../common/document-number";
import { dhakaParts } from "../common/dhaka-time";
import type { AuthenticatedStaff } from "../common/types";
import type { AdjustPointsDto, TierDto } from "./dto";

type Db = Prisma.TransactionClient | PrismaService;

export interface LoyaltySettings extends LoyaltyRules {
  enabled: boolean;
  pendingDays: number;
  expiryMonths: number;
  bonusReviewPhoto: number;
  bonusBirthday: number;
}

/** Order statuses that count as "the customer kept (some of) it" for earning (§6.12). */
const EARNING_STATUSES = ["delivered", "partially_delivered", "completed"] as const;
/** Enabling loyalty only rewards orders delivered within this many days, so switching it on never mass-awards old history (docs/DECISIONS.md). */
const EARN_LOOKBACK_DAYS = 30;
const SWEEP_BATCH = 200;

/**
 * Loyalty program (docs/PROJECT_SPEC.md §5.8, §6.12, §16 M13). The ledger
 * (`loyalty_transactions`) is the source of truth; `customers.points_balance`
 * is the sum of available rows and is only ever changed in the same
 * transaction as the row that explains it. Points are earned when an order
 * is delivered (pending until `loyalty.pendingDays` pass, then released),
 * spent at checkout (`redeemInTx`, called from `CheckoutService`), refunded
 * when a paid-with-points order is cancelled, and expire per lot. Every
 * grant is idempotent via the unique `(reason, reference)` pair, so each
 * sweep can safely re-run.
 */
@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);
  /** The Dhaka day the birthday pass last ran in this process: it only needs one pass a day, not one per tick. */
  private birthdayPassDay: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async getSettings(): Promise<LoyaltySettings> {
    const [enabled, spendPerPoint, pointValue, minRedeemPoints, maxRedeemPercent, pendingDays, expiryMonths, bonusReviewPhoto, bonusBirthday] = await Promise.all([
      this.settings.getValue<boolean>("loyalty.enabled"),
      this.settings.getValue<number>("loyalty.spendPerPoint"),
      this.settings.getValue<number>("loyalty.pointValue"),
      this.settings.getValue<number>("loyalty.minRedeemPoints"),
      this.settings.getValue<number>("loyalty.maxRedeemPercent"),
      this.settings.getValue<number>("loyalty.pendingDays"),
      this.settings.getValue<number>("loyalty.expiryMonths"),
      this.settings.getValue<number>("loyalty.bonus.reviewPhoto"),
      this.settings.getValue<number>("loyalty.bonus.birthday"),
    ]);
    return { enabled, spendPerPoint, pointValue, minRedeemPoints, maxRedeemPercent, pendingDays, expiryMonths, bonusReviewPhoto, bonusBirthday };
  }

  private expiryFrom(start: Date, expiryMonths: number): Date | null {
    return expiryMonths > 0 ? addMonths(start, expiryMonths) : null;
  }

  // ---------------------------------------------------------------------------
  // Tiers
  // ---------------------------------------------------------------------------

  listTiers() {
    return this.prisma.loyaltyTier.findMany({ orderBy: [{ minSpent: "asc" }, { position: "asc" }], include: { _count: { select: { customers: true } } } });
  }

  async createTier(dto: TierDto, actor: AuthenticatedStaff) {
    const tier = await this.prisma.loyaltyTier.create({ data: { ...dto, name: dto.name as Prisma.InputJsonValue, perks: (dto.perks ?? Prisma.DbNull) as Prisma.InputJsonValue } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "loyalty_tier.create", entityType: "loyalty_tier", entityId: tier.id, after: tier });
    await this.recomputeAllTiers();
    return tier;
  }

  async updateTier(id: string, dto: TierDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.loyaltyTier.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: "TIER_NOT_FOUND", message: "Tier not found" });
    const tier = await this.prisma.loyaltyTier.update({ where: { id }, data: { ...dto, name: dto.name as Prisma.InputJsonValue, perks: (dto.perks ?? Prisma.DbNull) as Prisma.InputJsonValue } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "loyalty_tier.update", entityType: "loyalty_tier", entityId: id, before, after: tier });
    await this.recomputeAllTiers();
    return tier;
  }

  async deleteTier(id: string, actor: AuthenticatedStaff) {
    const before = await this.prisma.loyaltyTier.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: "TIER_NOT_FOUND", message: "Tier not found" });
    await this.prisma.loyaltyTier.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "loyalty_tier.delete", entityType: "loyalty_tier", entityId: id, before });
    await this.recomputeAllTiers();
  }

  async recomputeTier(customerId: string, db: Db = this.prisma): Promise<void> {
    const [customer, tiers] = await Promise.all([db.customer.findUnique({ where: { id: customerId }, select: { totalSpent: true, tierId: true } }), db.loyaltyTier.findMany({ select: { id: true, minSpent: true } })]);
    if (!customer) return;
    const tierId = resolveTier(tiers, customer.totalSpent)?.id ?? null;
    if (tierId !== customer.tierId) await db.customer.update({ where: { id: customerId }, data: { tierId } });
  }

  /** Tiers by lifetime spend, one UPDATE per tier band — cheap enough to run on every tier edit and nightly. */
  async recomputeAllTiers(): Promise<void> {
    const tiers = await this.prisma.loyaltyTier.findMany({ orderBy: { minSpent: "asc" }, select: { id: true, minSpent: true } });
    if (tiers.length === 0) {
      await this.prisma.customer.updateMany({ where: { tierId: { not: null } }, data: { tierId: null } });
      return;
    }
    await this.prisma.customer.updateMany({ where: { totalSpent: { lt: tiers[0]!.minSpent }, tierId: { not: null } }, data: { tierId: null } });
    for (let i = 0; i < tiers.length; i += 1) {
      const tier = tiers[i]!;
      const next = tiers[i + 1];
      await this.prisma.customer.updateMany({
        where: { totalSpent: { gte: tier.minSpent, ...(next ? { lt: next.minSpent } : {}) }, NOT: { tierId: tier.id } },
        data: { tierId: tier.id },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Customer views
  // ---------------------------------------------------------------------------

  async summary(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, include: { tier: true } });
    if (!customer) throw new NotFoundException({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
    const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const [pending, expiring, tiers, settings] = await Promise.all([
      this.prisma.loyaltyTransaction.aggregate({ where: { customerId, status: "pending" }, _sum: { points: true } }),
      this.prisma.loyaltyTransaction.aggregate({ where: { customerId, status: "available", remaining: { gt: 0 }, expiresAt: { not: null, lte: soon } }, _sum: { remaining: true } }),
      this.prisma.loyaltyTier.findMany({ orderBy: { minSpent: "asc" } }),
      this.getSettings(),
    ]);
    const nextTier = tiers.find((t) => t.minSpent > customer.totalSpent) ?? null;
    return {
      enabled: settings.enabled,
      balance: customer.pointsBalance,
      balanceValue: customer.pointsBalance * settings.pointValue,
      pending: pending._sum.points ?? 0,
      expiringWithin30Days: expiring._sum.remaining ?? 0,
      tier: customer.tier,
      nextTier: nextTier ? { id: nextTier.id, name: nextTier.name, minSpent: nextTier.minSpent, remaining: nextTier.minSpent - customer.totalSpent } : null,
      totalSpent: customer.totalSpent,
      rules: { spendPerPoint: settings.spendPerPoint, pointValue: settings.pointValue, minRedeemPoints: settings.minRedeemPoints, maxRedeemPercent: settings.maxRedeemPercent, expiryMonths: settings.expiryMonths },
    };
  }

  async ledger(customerId: string, page = 1, pageSize = 50) {
    const where: Prisma.LoyaltyTransactionWhereInput = { customerId, NOT: { status: "void", points: 0 } };
    const [items, total] = await Promise.all([
      this.prisma.loyaltyTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.loyaltyTransaction.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  /** Credits an immediately-available lot. Returns false when this (reason, reference) was already granted. */
  async grant(customerId: string, points: number, reason: LoyaltyReason, reference: string | null, options: { note?: string; createdBy?: string; orderId?: string } = {}): Promise<boolean> {
    if (points <= 0) return false;
    const { expiryMonths } = await this.getSettings();
    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.loyaltyTransaction.create({
          data: { customerId, points, reason, status: "available", reference, orderId: options.orderId ?? null, remaining: points, availableAt: now, expiresAt: this.expiryFrom(now, expiryMonths), note: options.note ?? null, createdBy: options.createdBy ?? null },
        });
        await tx.customer.update({ where: { id: customerId }, data: { pointsBalance: { increment: points } } });
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  /** Spends `points` from the customer's lots and balance inside the caller's transaction; throws when the balance no longer covers it (a concurrent redemption won). */
  async debitInTx(tx: Prisma.TransactionClient, customerId: string, points: number, data: { reason: LoyaltyReason; reference: string | null; orderId?: string | null; note?: string | null; createdBy?: string | null }): Promise<void> {
    const updated = await tx.customer.updateMany({ where: { id: customerId, pointsBalance: { gte: points } }, data: { pointsBalance: { decrement: points } } });
    if (updated.count === 0) throw new BadRequestException({ code: "POINTS_INSUFFICIENT", message: "Not enough points available." });
    const lots = await tx.loyaltyTransaction.findMany({ where: { customerId, status: "available", remaining: { gt: 0 } }, select: { id: true, remaining: true, expiresAt: true } });
    const { allocations } = consumeLotsFifo(lots, points);
    for (const allocation of allocations) {
      await tx.loyaltyTransaction.update({ where: { id: allocation.id }, data: { remaining: { decrement: allocation.take } } });
    }
    await tx.loyaltyTransaction.create({ data: { customerId, points: -points, reason: data.reason, status: "available", reference: data.reference, orderId: data.orderId ?? null, note: data.note ?? null, createdBy: data.createdBy ?? null } });
  }

  /** §6.3 step 9 — called from `CheckoutService` inside the order-creation transaction. */
  async redeemInTx(tx: Prisma.TransactionClient, customerId: string, orderId: string, points: number): Promise<void> {
    if (points <= 0) return;
    await this.debitInTx(tx, customerId, points, { reason: "order_redeem", reference: orderId, orderId });
  }

  async adjust(customerId: string, dto: AdjustPointsDto, actor: AuthenticatedStaff) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, pointsBalance: true } });
    if (!customer) throw new NotFoundException({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
    if (dto.points > 0) {
      await this.grant(customerId, dto.points, "adjust", null, { note: dto.note, createdBy: actor.id });
    } else {
      await this.prisma.$transaction((tx) => this.debitInTx(tx, customerId, -dto.points, { reason: "adjust", reference: null, note: dto.note, createdBy: actor.id }));
    }
    const after = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { pointsBalance: true } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "loyalty.adjust", entityType: "customer", entityId: customerId, before: { pointsBalance: customer.pointsBalance }, after: { pointsBalance: after.pointsBalance, points: dto.points, note: dto.note } });
    return this.summary(customerId);
  }

  // ---------------------------------------------------------------------------
  // Sweeps (registered with the scheduler in LoyaltyModule)
  // ---------------------------------------------------------------------------

  private async orderEarnPoints(orderId: string, multiplierPercent: number, spendPerPoint: number): Promise<number> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { pointsDiscount: true, items: { select: { lineTotal: true, discountAllocated: true, quantity: true, rejectedQty: true, returnedQty: true } } } });
    if (!order) return 0;
    return computeEarnPoints(eligibleSpendForOrder(order.items, order.pointsDiscount), spendPerPoint, multiplierPercent);
  }

  /** Creates a pending earn row for each newly delivered order of a known customer. */
  async earnSweep(): Promise<{ created: number }> {
    const settings = await this.getSettings();
    if (!settings.enabled) return { created: 0 };
    const rows = await this.prisma.$queryRaw<{ id: string; customer_id: string; delivered_at: Date }[]>`
      SELECT o.id, o.customer_id, o.delivered_at FROM orders o
      WHERE o.customer_id IS NOT NULL AND o.delivered_at IS NOT NULL
        AND o.delivered_at >= now() - make_interval(days => ${EARN_LOOKBACK_DAYS})
        AND o.status::text IN ('delivered', 'partially_delivered', 'completed')
        AND NOT EXISTS (SELECT 1 FROM loyalty_transactions t WHERE t.reason = 'order_delivered' AND t.reference = o.id)
      ORDER BY o.delivered_at ASC LIMIT ${SWEEP_BATCH}`;
    let created = 0;
    for (const row of rows) {
      const customer = await this.prisma.customer.findUnique({ where: { id: row.customer_id }, select: { tier: { select: { earnMultiplierPercent: true } } } });
      const points = await this.orderEarnPoints(row.id, customer?.tier?.earnMultiplierPercent ?? 100, settings.spendPerPoint);
      const availableAt = new Date(row.delivered_at.getTime() + settings.pendingDays * 24 * 60 * 60 * 1000);
      try {
        await this.prisma.loyaltyTransaction.create({
          data: {
            customerId: row.customer_id,
            points,
            reason: "order_delivered",
            // A zero-point row still records "considered" so the sweep never re-scans this order.
            status: points > 0 ? "pending" : "void",
            reference: row.id,
            orderId: row.id,
            remaining: 0,
            availableAt,
          },
        });
        if (points > 0) created += 1;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    return { created };
  }

  /** Makes pending points usable once the return window has passed — re-checking the order first so returns and rejections never leave points behind. */
  async releaseSweep(): Promise<{ released: number; voided: number }> {
    const settings = await this.getSettings();
    const due = await this.prisma.loyaltyTransaction.findMany({ where: { status: "pending", availableAt: { lte: new Date() } }, take: SWEEP_BATCH, include: { customer: { select: { tier: { select: { earnMultiplierPercent: true } } } } } });
    let released = 0;
    let voided = 0;
    for (const row of due) {
      const order = row.orderId ? await this.prisma.order.findUnique({ where: { id: row.orderId }, select: { status: true } }) : null;
      const stillEarns = order !== null && (EARNING_STATUSES as readonly string[]).includes(order.status);
      // Recomputed now so items returned during the window drop out; never more than first promised.
      const points = stillEarns && row.orderId ? Math.min(row.points, await this.orderEarnPoints(row.orderId, row.customer.tier?.earnMultiplierPercent ?? 100, settings.spendPerPoint)) : 0;
      const now = new Date();
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.loyaltyTransaction.updateMany({
          where: { id: row.id, status: "pending" },
          data: points > 0 ? { status: "available", points, remaining: points, availableAt: now, expiresAt: this.expiryFrom(now, settings.expiryMonths) } : { status: "void", note: "Order returned, rejected or cancelled before release" },
        });
        if (claimed.count === 1 && points > 0) await tx.customer.update({ where: { id: row.customerId }, data: { pointsBalance: { increment: points } } });
      });
      if (points > 0) {
        released += 1;
        await this.recomputeTier(row.customerId);
      } else {
        voided += 1;
      }
    }
    return { released, voided };
  }

  /** Expires what's left of each lot past its expiry date. */
  async expirySweep(): Promise<{ expired: number }> {
    const lots = await this.prisma.loyaltyTransaction.findMany({ where: { status: "available", remaining: { gt: 0 }, expiresAt: { lte: new Date() } }, take: SWEEP_BATCH });
    let expired = 0;
    for (const lot of lots) {
      await this.prisma.$transaction(async (tx) => {
        const fresh = await tx.loyaltyTransaction.findUnique({ where: { id: lot.id }, select: { remaining: true } });
        if (!fresh || fresh.remaining <= 0) return;
        await tx.loyaltyTransaction.update({ where: { id: lot.id }, data: { remaining: 0 } });
        const customer = await tx.customer.findUniqueOrThrow({ where: { id: lot.customerId }, select: { pointsBalance: true } });
        const points = Math.min(fresh.remaining, customer.pointsBalance);
        if (points > 0) await tx.customer.update({ where: { id: lot.customerId }, data: { pointsBalance: { decrement: points } } });
        await tx.loyaltyTransaction.create({ data: { customerId: lot.customerId, points: -points, reason: "expire", status: "available", reference: `expire:${lot.id}` } });
      });
      expired += 1;
    }
    return { expired };
  }

  /** Gives points back when an order paid partly with points is cancelled or expires unpaid. */
  async reversalSweep(): Promise<{ reversed: number }> {
    const rows = await this.prisma.$queryRaw<{ id: string; customer_id: string; points_redeemed: number }[]>`
      SELECT o.id, o.customer_id, o.points_redeemed FROM orders o
      WHERE o.points_redeemed > 0 AND o.customer_id IS NOT NULL AND o.status::text IN ('cancelled', 'expired')
        AND NOT EXISTS (SELECT 1 FROM loyalty_transactions t WHERE t.reason = 'redeem_reversal' AND t.reference = o.id)
      LIMIT ${SWEEP_BATCH}`;
    let reversed = 0;
    for (const row of rows) {
      if (await this.grant(row.customer_id, row.points_redeemed, "redeem_reversal", row.id, { orderId: row.id, note: "Order cancelled — points returned" })) reversed += 1;
    }
    return { reversed };
  }

  /** Photo-review and birthday bonuses (§6.12 "Bonus points: review with photo, birthday"). Referral bonuses arrive with the referral program (M16). */
  async bonusSweep(now = new Date()): Promise<{ granted: number }> {
    const settings = await this.getSettings();
    if (!settings.enabled) return { granted: 0 };
    let granted = 0;

    if (settings.bonusReviewPhoto > 0) {
      const reviews = await this.prisma.$queryRaw<{ id: string; customer_id: string }[]>`
        SELECT r.id, r.customer_id FROM reviews r
        WHERE r.status = 'approved' AND r.customer_id IS NOT NULL AND cardinality(r.media_urls) > 0
          AND r.created_at >= now() - make_interval(days => ${EARN_LOOKBACK_DAYS})
          AND NOT EXISTS (SELECT 1 FROM loyalty_transactions t WHERE t.reason = 'review_photo' AND t.reference = r.id)
        LIMIT ${SWEEP_BATCH}`;
      for (const review of reviews) {
        if (await this.grant(review.customer_id, settings.bonusReviewPhoto, "review_photo", review.id, { note: "Photo review bonus" })) granted += 1;
      }
    }

    const { year, month, day } = dhakaParts(now);
    const dayKey = `${year}-${month}-${day}`;
    if (settings.bonusBirthday > 0 && this.birthdayPassDay !== dayKey) {
      this.birthdayPassDay = dayKey;
      const customers = await this.birthdaysOn(month + 1, day); // dhakaParts months are 0-based
      for (const customer of customers) {
        if (await this.grant(customer.id, settings.bonusBirthday, "birthday", `birthday:${year}:${customer.id}`, { note: "Happy birthday!" })) granted += 1;
      }
    }
    return { granted };
  }

  /** Customers whose birthday (stored as a date) falls on this 1-based month and day — shared with the birthday journey. */
  birthdaysOn(month: number, day: number): Promise<{ id: string }[]> {
    return this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM customers
      WHERE birthday IS NOT NULL AND deleted_at IS NULL AND status = 'active'
        AND EXTRACT(MONTH FROM birthday) = ${month} AND EXTRACT(DAY FROM birthday) = ${day}
      LIMIT 5000`;
  }

  /** Program-level numbers for the admin Loyalty screen. */
  async stats() {
    const [outstanding, pending, members, earned30, redeemed30, tiers, settings] = await Promise.all([
      this.prisma.customer.aggregate({ _sum: { pointsBalance: true } }),
      this.prisma.loyaltyTransaction.aggregate({ where: { status: "pending" }, _sum: { points: true } }),
      this.prisma.customer.count({ where: { pointsBalance: { gt: 0 } } }),
      this.prisma.loyaltyTransaction.aggregate({ where: { points: { gt: 0 }, status: "available", createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _sum: { points: true } }),
      this.prisma.loyaltyTransaction.aggregate({ where: { reason: "order_redeem", createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _sum: { points: true } }),
      this.listTiers(),
      this.getSettings(),
    ]);
    const outstandingPoints = outstanding._sum.pointsBalance ?? 0;
    return {
      enabled: settings.enabled,
      outstandingPoints,
      outstandingLiability: outstandingPoints * settings.pointValue,
      pendingPoints: pending._sum.points ?? 0,
      membersWithPoints: members,
      earnedLast30Days: earned30._sum.points ?? 0,
      redeemedLast30Days: Math.abs(redeemed30._sum.points ?? 0),
      tiers,
    };
  }

  /** One scheduler tick: every loyalty sweep, each isolated so one failure doesn't block the rest. */
  async runSweeps(): Promise<void> {
    for (const [name, sweep] of [
      ["earn", () => this.earnSweep()],
      ["release", () => this.releaseSweep()],
      ["reversal", () => this.reversalSweep()],
      ["expiry", () => this.expirySweep()],
    ] as const) {
      try {
        await sweep();
      } catch (error) {
        this.logger.error(`Loyalty ${name} sweep failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }
}
