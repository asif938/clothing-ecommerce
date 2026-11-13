import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma, ReferralStatus } from "@clothing/db";
import { formatTakaFromPoisha } from "@clothing/shared/notifications";
import { checkReferral, computeReferralDiscount, looksLikeReferralCode, normalizeReferralCode, type ReferralDiscountRules, type ReferralRejection } from "@clothing/shared/rewards";
import type { Env } from "../config/env.schema";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { LoyaltyService } from "../loyalty/loyalty.service";
import { StoreCreditLedgerService } from "../rewards-core/store-credit-ledger.service";
import { dhakaParts } from "../common/dhaka-time";
import type { AuthenticatedStaff } from "../common/types";

const SWEEP_BATCH = 200;
const PAGE_SIZE = 50;
/** Order statuses after which a pending referral can never earn. */
const VOIDING_STATUSES = ["cancelled", "expired", "rejected_at_door", "returned_to_sender", "returned_to_warehouse"] as const;

export interface ReferralSettings {
  enabled: boolean;
  discount: ReferralDiscountRules;
  combinableWithCoupons: boolean;
  rewardType: "store_credit" | "points";
  rewardAmount: number;
  rewardPoints: number;
  maxRewardsPerMonth: number;
}

/** §6.3 — what the cart shows for a referral code. */
export interface CartReferralQuote {
  code: string;
  referrerName: string | null;
  discount: number;
  rejection: ReferralRejection | null;
}

/**
 * Referral program (docs/PROJECT_SPEC.md §5.8, §6.12): the referee gets a
 * first-order discount; the referrer gets store credit or points once that
 * order completes (after the return window). One referral per referee phone,
 * never for yourself, capped per referrer per month.
 */
@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly loyalty: LoyaltyService,
    private readonly storeCredit: StoreCreditLedgerService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  async getSettings(): Promise<ReferralSettings> {
    const [enabled, type, percent, amount, maxDiscount, minOrder, combinableWithCoupons, rewardType, rewardAmount, rewardPoints, maxRewardsPerMonth] = await Promise.all([
      this.settings.getValue<boolean>("referral.enabled"),
      this.settings.getValue<"percent" | "fixed">("referral.refereeDiscountType"),
      this.settings.getValue<number>("referral.refereeDiscountPercent"),
      this.settings.getValue<number>("referral.refereeDiscountAmount"),
      this.settings.getValue<number>("referral.refereeMaxDiscount"),
      this.settings.getValue<number>("referral.refereeMinOrder"),
      this.settings.getValue<boolean>("referral.combinableWithCoupons"),
      this.settings.getValue<"store_credit" | "points">("referral.rewardType"),
      this.settings.getValue<number>("referral.rewardAmount"),
      this.settings.getValue<number>("referral.rewardPoints"),
      this.settings.getValue<number>("referral.maxRewardsPerMonth"),
    ]);
    return {
      enabled,
      discount: { type, value: type === "percent" ? percent : amount, maxDiscount, minOrder },
      combinableWithCoupons,
      rewardType,
      rewardAmount,
      rewardPoints,
      maxRewardsPerMonth,
    };
  }

  /** Customers' referral codes look like `A1B2C3D4`; null when the program is off or the code isn't one. */
  async findReferrer(rawCode: string) {
    const code = normalizeReferralCode(rawCode);
    if (!looksLikeReferralCode(code)) return null;
    return this.prisma.customer.findUnique({ where: { referralCode: code }, select: { id: true, name: true, phone: true, status: true, referralCode: true, deletedAt: true } });
  }

  /** Pricing step: the referee discount for this cart, or why it doesn't apply. */
  async quote(rawCode: string | null, ctx: { customerId: string | null; phone: string | null; goodsTotal: number; couponApplied: boolean }): Promise<CartReferralQuote | null> {
    if (!rawCode) return null;
    const settings = await this.getSettings();
    if (!settings.enabled) return null;
    const code = normalizeReferralCode(rawCode);
    const referrer = await this.findReferrer(code);
    const [previousOrders, alreadyReferred] = await Promise.all([this.previousOrders(ctx.customerId, ctx.phone), ctx.phone ? this.prisma.referral.findUnique({ where: { refereePhone: ctx.phone }, select: { id: true } }) : null]);
    let rejection = checkReferral({
      referrer: referrer && !referrer.deletedAt ? { id: referrer.id, phone: referrer.phone, status: referrer.status } : null,
      refereeCustomerId: ctx.customerId,
      refereePhone: ctx.phone,
      refereePreviousOrders: previousOrders,
      refereeAlreadyReferred: alreadyReferred !== null,
      couponApplied: ctx.couponApplied,
      combinableWithCoupons: settings.combinableWithCoupons,
    });
    const discount = rejection ? 0 : computeReferralDiscount(ctx.goodsTotal, settings.discount);
    if (!rejection && discount === 0) rejection = "BELOW_MINIMUM";
    return { code, referrerName: firstName(referrer?.name ?? null), discount, rejection };
  }

  private async previousOrders(customerId: string | null, phone: string | null): Promise<number> {
    const [byCustomer, byPhone] = await Promise.all([
      customerId ? this.prisma.order.count({ where: { customerId, status: { notIn: ["expired"] } } }) : 0,
      phone ? this.prisma.customer.findUnique({ where: { phone }, select: { ordersCount: true } }) : null,
    ]);
    return Math.max(byCustomer, byPhone?.ordersCount ?? 0);
  }

  /** Records the referral inside the order-creation transaction. The unique referee phone means a lost race rolls back the order rather than double-discounting. */
  async createInTx(tx: Prisma.TransactionClient, input: { orderId: string; code: string; refereeCustomerId: string | null; refereePhone: string; discount: number }): Promise<void> {
    const referrer = await tx.customer.findUnique({ where: { referralCode: input.code }, select: { id: true } });
    if (!referrer) throw new BadRequestException({ code: "REFERRAL_INVALID", message: "That referral code is no longer valid." });
    const existing = await tx.referral.findUnique({ where: { refereePhone: input.refereePhone }, select: { id: true } });
    if (existing) throw new BadRequestException({ code: "REFERRAL_ALREADY_USED", message: "This phone number has already used a referral. Please remove the referral and try again." });
    await tx.referral.create({ data: { referrerCustomerId: referrer.id, refereeCustomerId: input.refereeCustomerId, refereePhone: input.refereePhone, code: input.code, orderId: input.orderId, refereeDiscount: input.discount } });
    if (input.refereeCustomerId) await tx.customer.updateMany({ where: { id: input.refereeCustomerId, referredBy: null }, data: { referredBy: referrer.id } });
  }

  // ---------------------------------------------------------------------------
  // Sweep — reward or void pending referrals as their orders settle
  // ---------------------------------------------------------------------------

  async rewardSweep(now = new Date()): Promise<{ rewarded: number; voided: number }> {
    const settings = await this.getSettings();
    const pending = await this.prisma.referral.findMany({ where: { status: "pending" }, take: SWEEP_BATCH, orderBy: { createdAt: "asc" } });
    if (pending.length === 0) return { rewarded: 0, voided: 0 };
    const orders = await this.prisma.order.findMany({ where: { id: { in: pending.map((r) => r.orderId) } }, select: { id: true, status: true } });
    const statusById = new Map(orders.map((o) => [o.id, o.status as string]));
    let rewarded = 0;
    let voided = 0;
    for (const referral of pending) {
      const status = statusById.get(referral.orderId);
      if (status === undefined || (VOIDING_STATUSES as readonly string[]).includes(status)) {
        await this.voidPending(referral.id, status === undefined ? "Order deleted" : `Order ${status}`);
        voided += 1;
        continue;
      }
      if (status !== "completed" || !settings.enabled) continue;
      if (settings.rewardType === "points" && !(await this.loyalty.getSettings()).enabled) continue; // waits until loyalty is switched back on
      if (settings.maxRewardsPerMonth > 0 && (await this.rewardsThisMonth(referral.referrerCustomerId, now)) >= settings.maxRewardsPerMonth) {
        await this.voidPending(referral.id, "Monthly referral reward limit reached");
        voided += 1;
        continue;
      }
      if (await this.reward(referral.id, referral.referrerCustomerId, settings)) rewarded += 1;
    }
    return { rewarded, voided };
  }

  private async voidPending(id: string, reason: string): Promise<void> {
    await this.prisma.referral.updateMany({ where: { id, status: "pending" }, data: { status: "void", voidReason: reason } });
  }

  private async rewardsThisMonth(referrerId: string, now: Date): Promise<number> {
    const { year, month } = dhakaParts(now);
    // Start of the Dhaka calendar month (UTC+6, no DST).
    const start = new Date(Date.UTC(year, month, 1) - 6 * 60 * 60 * 1000);
    return this.prisma.referral.count({ where: { referrerCustomerId: referrerId, status: "rewarded", rewardedAt: { gte: start } } });
  }

  private async reward(referralId: string, referrerId: string, settings: ReferralSettings): Promise<boolean> {
    const isPoints = settings.rewardType === "points";
    const amount = isPoints ? settings.rewardPoints : settings.rewardAmount;
    const claimed = await this.prisma.referral.updateMany({ where: { id: referralId, status: "pending" }, data: { status: "rewarded", rewardType: settings.rewardType, rewardAmount: amount, rewardedAt: new Date() } });
    if (claimed.count === 0) return false;
    if (amount > 0) {
      // Both grants are idempotent on the referral id, so a crash between the claim and the grant can be repaired by re-granting.
      if (isPoints) await this.loyalty.grant(referrerId, amount, "referral", referralId, { note: "Referral reward" });
      else await this.storeCredit.credit(referrerId, amount, { reason: "referral", reference: referralId, note: "Referral reward" });
      await this.notifyReferrer(referrerId, isPoints ? `${amount} points` : formatTakaFromPoisha(amount), referralId).catch((error: unknown) =>
        this.logger.warn(`Referral reward notification failed: ${error instanceof Error ? error.message : "Unknown error"}`),
      );
    }
    return true;
  }

  private async notifyReferrer(customerId: string, reward: string, referralId: string): Promise<void> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, phone: true, email: true, locale: true } });
    if (!customer) return;
    const common = await this.notifications.commonVariables();
    await this.prisma.$transaction((tx) =>
      this.notifications.enqueue(tx, {
        event: "referral_reward",
        recipientType: "customer",
        recipientId: customerId,
        locale: customer.locale,
        contacts: { sms: customer.phone, whatsapp: customer.phone, email: customer.email, push: customerId },
        variables: { ...common, customer_name: customer.name ?? "", reward },
        related: { type: "referral", id: referralId },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Admin and storefront views
  // ---------------------------------------------------------------------------

  async list(status: ReferralStatus | undefined, page: number) {
    const where: Prisma.ReferralWhereInput = status ? { status } : {};
    const [items, total] = await Promise.all([
      this.prisma.referral.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { referrer: { select: { id: true, name: true, phone: true } }, referee: { select: { id: true, name: true, phone: true } } },
      }),
      this.prisma.referral.count({ where }),
    ]);
    const orders = await this.prisma.order.findMany({ where: { id: { in: items.map((r) => r.orderId) } }, select: { id: true, orderNumber: true, status: true, total: true } });
    const orderById = new Map(orders.map((o) => [o.id, o]));
    return { items: items.map((r) => ({ ...r, order: orderById.get(r.orderId) ?? null })), total, page, pageSize: PAGE_SIZE };
  }

  async stats() {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [byStatus, discounts, rewards30, top] = await Promise.all([
      this.prisma.referral.groupBy({ by: ["status"], _count: true }),
      this.prisma.referral.aggregate({ where: { status: { not: "void" } }, _sum: { refereeDiscount: true } }),
      this.prisma.referral.count({ where: { status: "rewarded", rewardedAt: { gte: since } } }),
      this.prisma.referral.groupBy({ by: ["referrerCustomerId"], where: { status: { not: "void" } }, _count: true, orderBy: { _count: { referrerCustomerId: "desc" } }, take: 10 }),
    ]);
    const referrers = await this.prisma.customer.findMany({ where: { id: { in: top.map((t) => t.referrerCustomerId) } }, select: { id: true, name: true, phone: true } });
    const byId = new Map(referrers.map((c) => [c.id, c]));
    const count = (s: ReferralStatus) => byStatus.find((b) => b.status === s)?._count ?? 0;
    return {
      settings: await this.getSettings(),
      pending: count("pending"),
      rewarded: count("rewarded"),
      voided: count("void"),
      rewardedLast30Days: rewards30,
      discountsGiven: discounts._sum.refereeDiscount ?? 0,
      topReferrers: top.map((t) => ({ customer: byId.get(t.referrerCustomerId) ?? null, referrals: t._count })),
    };
  }

  async voidReferral(id: string, reason: string, actor: AuthenticatedStaff) {
    const referral = await this.prisma.referral.findUnique({ where: { id } });
    if (!referral) throw new NotFoundException({ code: "REFERRAL_NOT_FOUND", message: "Referral not found" });
    if (referral.status !== "pending") throw new BadRequestException({ code: "INVALID_STATE", message: "Only pending referrals can be voided." });
    await this.voidPending(id, reason);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "referral.void", entityType: "referral", entityId: id, before: { status: "pending" }, after: { status: "void", reason } });
    return this.prisma.referral.findUniqueOrThrow({ where: { id } });
  }

  /** `/account/referrals` — the customer's code, share link, rules and the friends they referred (phones masked). */
  async mine(customerId: string, locale: string) {
    const [customer, settings, referrals] = await Promise.all([
      this.prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { referralCode: true } }),
      this.getSettings(),
      this.prisma.referral.findMany({ where: { referrerCustomerId: customerId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, refereePhone: true, status: true, rewardType: true, rewardAmount: true, createdAt: true, rewardedAt: true } }),
    ]);
    const code = customer.referralCode;
    return {
      enabled: settings.enabled,
      code,
      link: code ? `${this.config.get("STOREFRONT_URL", { infer: true })}/${locale === "en" ? "en" : "bn"}?ref=${code}` : null,
      rules: { discount: settings.discount, rewardType: settings.rewardType, rewardAmount: settings.rewardAmount, rewardPoints: settings.rewardPoints },
      referrals: referrals.map((r) => ({ ...r, refereePhone: `•••${r.refereePhone.slice(-3)}` })),
      totals: {
        pending: referrals.filter((r) => r.status === "pending").length,
        rewarded: referrals.filter((r) => r.status === "rewarded").length,
        earnedCredit: referrals.filter((r) => r.status === "rewarded" && r.rewardType === "store_credit").reduce((sum, r) => sum + (r.rewardAmount ?? 0), 0),
        earnedPoints: referrals.filter((r) => r.status === "rewarded" && r.rewardType === "points").reduce((sum, r) => sum + (r.rewardAmount ?? 0), 0),
      },
    };
  }

  /** The `?ref=` landing banner: is this code live, and what does the friend get? Never reveals more than the referrer's first name. */
  async publicCode(rawCode: string) {
    const settings = await this.getSettings();
    const referrer = settings.enabled ? await this.findReferrer(rawCode) : null;
    const valid = referrer !== null && referrer.status === "active" && !referrer.deletedAt;
    return { valid, referrerName: valid ? firstName(referrer.name) : null, discount: valid ? settings.discount : null };
  }
}

function firstName(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}
