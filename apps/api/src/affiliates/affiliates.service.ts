import { randomBytes } from "node:crypto";
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Affiliate, Prisma } from "@clothing/db";
import { commissionBase, computeCommission, isAffiliateCodeShape, normalizeAffiliateCode, withinAttributionWindow } from "@clothing/shared/rewards";
import type { Env } from "../config/env.schema";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { isUniqueViolation } from "../common/document-number";
import { dhakaParts } from "../common/dhaka-time";
import type { AuthenticatedStaff } from "../common/types";
import type { AffiliateDto, ConversionsQueryDto, PayoutDto, RejectConversionDto } from "./dto";

const SWEEP_BATCH = 200;
const PAGE_SIZE = 50;
const REJECTING_STATUSES = ["cancelled", "expired", "rejected_at_door", "returned_to_sender", "returned_to_warehouse"] as const;

export interface AttributionInput {
  orderId: string;
  /** Discounts applied to the order (the affiliate's coupon wins over a link click). */
  discountIds: string[];
  cartAffiliateCode: string | null;
  cartAffiliateClickedAt: Date | null;
  phone: string | null;
  customerId: string | null;
  lines: { lineTotal: number; discountAllocated: number; quantity: number }[];
  /** Order-level reductions that aren't in `discountAllocated` (referral discount, points). */
  orderLevelDiscounts: number;
}

/**
 * Affiliate / influencer tracking and commissions (docs/PROJECT_SPEC.md §5.8,
 * §6.8 "delivered → completed: affiliate commission approved", §16 M16).
 * An order is attributed at placement by the affiliate's coupon or, failing
 * that, a link click within the attribution window; the commission is
 * pending until the order completes (recomputed then for returned items),
 * rejected if the order never does, and marked paid by a recorded payout.
 */
@Injectable()
export class AffiliatesService {
  private readonly logger = new Logger(AffiliatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  private storefrontUrl(): string {
    return this.config.get("STOREFRONT_URL", { infer: true });
  }

  // ---------------------------------------------------------------------------
  // Admin CRUD
  // ---------------------------------------------------------------------------

  async list() {
    const affiliates = await this.prisma.affiliate.findMany({ orderBy: { createdAt: "desc" } });
    const ids = affiliates.map((a) => a.id);
    const since = dayStart(new Date(Date.now() - 29 * 86_400_000));
    const [clicks, sums] = await Promise.all([
      this.prisma.affiliateClickDay.groupBy({ by: ["affiliateId"], where: { affiliateId: { in: ids }, day: { gte: since } }, _sum: { clicks: true } }),
      this.prisma.affiliateConversion.groupBy({ by: ["affiliateId", "status"], where: { affiliateId: { in: ids } }, _sum: { commission: true, orderAmount: true }, _count: true }),
    ]);
    const discountIds = affiliates.map((a) => a.discountId).filter((id): id is string => id !== null);
    const discounts = await this.prisma.discount.findMany({ where: { id: { in: discountIds } }, select: { id: true, code: true, name: true } });
    const discountById = new Map(discounts.map((d) => [d.id, d]));
    const items = affiliates.map((a) => {
      const rows = sums.filter((s) => s.affiliateId === a.id);
      const sum = (status: string) => rows.find((r) => r.status === status)?._sum.commission ?? 0;
      return {
        ...a,
        coupon: a.discountId ? (discountById.get(a.discountId) ?? null) : null,
        link: this.linkFor(a.code),
        clicksLast30Days: clicks.find((c) => c.affiliateId === a.id)?._sum.clicks ?? 0,
        conversions: rows.filter((r) => r.status !== "rejected").reduce((n, r) => n + r._count, 0),
        revenue: rows.filter((r) => r.status !== "rejected").reduce((n, r) => n + (r._sum.orderAmount ?? 0), 0),
        pendingCommission: sum("pending"),
        approvedCommission: sum("approved"),
        paidCommission: sum("paid"),
      };
    });
    return { enabled: await this.settings.getValue<boolean>("affiliates.enabled"), items };
  }

  linkFor(code: string): string {
    return `${this.storefrontUrl()}/bn?aff=${encodeURIComponent(code)}`;
  }

  async get(id: string) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { id }, include: { payouts: { orderBy: { createdAt: "desc" }, take: 50 } } });
    if (!affiliate) throw new NotFoundException({ code: "AFFILIATE_NOT_FOUND", message: "Affiliate not found" });
    const since = dayStart(new Date(Date.now() - 29 * 86_400_000));
    const [clickDays, coupon] = await Promise.all([
      this.prisma.affiliateClickDay.findMany({ where: { affiliateId: id, day: { gte: since } }, orderBy: { day: "asc" } }),
      affiliate.discountId ? this.prisma.discount.findUnique({ where: { id: affiliate.discountId }, select: { id: true, code: true, name: true } }) : null,
    ]);
    return { ...affiliate, coupon, link: this.linkFor(affiliate.code), portalUrl: `${this.storefrontUrl()}/bn/affiliate/${affiliate.portalToken}`, clickDays, balances: await this.balances(id) };
  }

  private async balances(affiliateId: string) {
    const rows = await this.prisma.affiliateConversion.groupBy({ by: ["status"], where: { affiliateId }, _sum: { commission: true }, _count: true });
    const pick = (status: string) => ({ amount: rows.find((r) => r.status === status)?._sum.commission ?? 0, count: rows.find((r) => r.status === status)?._count ?? 0 });
    return { pending: pick("pending"), approved: pick("approved"), paid: pick("paid"), rejected: pick("rejected"), minPayout: await this.settings.getValue<number>("affiliates.minPayout") };
  }

  private async assertDiscount(discountId: string | null | undefined, selfId: string | null): Promise<void> {
    if (!discountId) return;
    const discount = await this.prisma.discount.findUnique({ where: { id: discountId }, select: { type: true, code: true } });
    if (!discount || discount.type !== "code" || !discount.code) throw new BadRequestException({ code: "DISCOUNT_NOT_CODE", message: "Link a coupon code discount." });
    const owner = await this.prisma.affiliate.findUnique({ where: { discountId }, select: { id: true } });
    if (owner && owner.id !== selfId) throw new BadRequestException({ code: "DISCOUNT_TAKEN", message: "That coupon already belongs to another affiliate." });
  }

  async create(dto: AffiliateDto, actor: AuthenticatedStaff) {
    await this.assertDiscount(dto.discountId, null);
    try {
      const affiliate = await this.prisma.affiliate.create({ data: { ...this.toData(dto), portalToken: randomBytes(18).toString("base64url") } });
      await this.audit.record({ actorType: "staff", actorId: actor.id, action: "affiliate.create", entityType: "affiliate", entityId: affiliate.id, after: redact(affiliate) });
      return this.get(affiliate.id);
    } catch (error) {
      if (isUniqueViolation(error)) throw new BadRequestException({ code: "AFFILIATE_CODE_TAKEN", message: "Another affiliate already uses that code." });
      throw error;
    }
  }

  async update(id: string, dto: AffiliateDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.affiliate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: "AFFILIATE_NOT_FOUND", message: "Affiliate not found" });
    await this.assertDiscount(dto.discountId, id);
    try {
      const affiliate = await this.prisma.affiliate.update({ where: { id }, data: this.toData(dto) });
      await this.audit.record({ actorType: "staff", actorId: actor.id, action: "affiliate.update", entityType: "affiliate", entityId: id, before: redact(before), after: redact(affiliate) });
      return this.get(id);
    } catch (error) {
      if (isUniqueViolation(error)) throw new BadRequestException({ code: "AFFILIATE_CODE_TAKEN", message: "Another affiliate already uses that code." });
      throw error;
    }
  }

  /** A new private portal link (the old one stops working) — for when a partner's link leaks. */
  async rotatePortalToken(id: string, actor: AuthenticatedStaff) {
    await this.prisma.affiliate.update({ where: { id }, data: { portalToken: randomBytes(18).toString("base64url") } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "affiliate.rotate_portal", entityType: "affiliate", entityId: id });
    return this.get(id);
  }

  private toData(dto: AffiliateDto) {
    return {
      name: dto.name,
      code: dto.code,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      discountId: dto.discountId ?? null,
      commissionType: dto.commissionType,
      commissionValue: dto.commissionValue,
      attributionDays: dto.attributionDays ?? null,
      status: dto.status,
      payoutMethod: dto.payoutMethod ?? null,
      payoutDetails: dto.payoutDetails ?? null,
      notes: dto.notes ?? null,
    };
  }

  async conversions(query: ConversionsQueryDto) {
    const where: Prisma.AffiliateConversionWhereInput = { ...(query.affiliateId ? { affiliateId: query.affiliateId } : {}), ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.affiliateConversion.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { affiliate: { select: { id: true, name: true, code: true } } } }),
      this.prisma.affiliateConversion.count({ where }),
    ]);
    const orders = await this.prisma.order.findMany({ where: { id: { in: items.map((c) => c.orderId) } }, select: { id: true, orderNumber: true, status: true } });
    const byId = new Map(orders.map((o) => [o.id, o]));
    return { items: items.map((c) => ({ ...c, order: byId.get(c.orderId) ?? null })), total, page: query.page, pageSize: PAGE_SIZE };
  }

  async rejectConversion(id: string, dto: RejectConversionDto, actor: AuthenticatedStaff) {
    const conversion = await this.prisma.affiliateConversion.findUnique({ where: { id } });
    if (!conversion) throw new NotFoundException({ code: "CONVERSION_NOT_FOUND", message: "Conversion not found" });
    if (conversion.status === "paid" || conversion.status === "rejected") throw new BadRequestException({ code: "INVALID_STATE", message: "This commission is already closed." });
    const updated = await this.prisma.affiliateConversion.update({ where: { id }, data: { status: "rejected", rejectedReason: dto.reason } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "affiliate_conversion.reject", entityType: "affiliate_conversion", entityId: id, before: { status: conversion.status }, after: { status: "rejected", reason: dto.reason } });
    return updated;
  }

  /** Pays every approved, unpaid commission of one affiliate in one payout record (the money itself moves outside the system — bKash/bank). */
  async recordPayout(affiliateId: string, dto: PayoutDto, actor: AuthenticatedStaff) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { id: affiliateId }, select: { id: true } });
    if (!affiliate) throw new NotFoundException({ code: "AFFILIATE_NOT_FOUND", message: "Affiliate not found" });
    const payout = await this.prisma.$transaction(async (tx) => {
      const due = await tx.affiliateConversion.findMany({ where: { affiliateId, status: "approved", payoutId: null }, select: { id: true, commission: true } });
      const amount = due.reduce((sum, c) => sum + c.commission, 0);
      if (due.length === 0 || amount <= 0) throw new BadRequestException({ code: "NOTHING_TO_PAY", message: "There's no approved commission to pay." });
      const created = await tx.affiliatePayout.create({ data: { affiliateId, amount, method: dto.method, externalRef: dto.externalRef ?? null, note: dto.note ?? null, createdBy: actor.id } });
      const claimed = await tx.affiliateConversion.updateMany({ where: { id: { in: due.map((c) => c.id) }, status: "approved", payoutId: null }, data: { status: "paid", payoutId: created.id } });
      if (claimed.count !== due.length) throw new BadRequestException({ code: "PAYOUT_CONFLICT", message: "Commissions changed while recording the payout. Please try again." });
      return created;
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "affiliate.payout", entityType: "affiliate", entityId: affiliateId, after: payout });
    return payout;
  }

  // ---------------------------------------------------------------------------
  // Storefront tracking
  // ---------------------------------------------------------------------------

  async findActiveByCode(rawCode: string): Promise<Affiliate | null> {
    const code = normalizeAffiliateCode(rawCode);
    if (!isAffiliateCodeShape(code)) return null;
    const affiliate = await this.prisma.affiliate.findUnique({ where: { code } });
    return affiliate?.status === "active" ? affiliate : null;
  }

  /** Counts a link click (per Dhaka day). Returns the affiliate's code when it's live so the caller can remember it on the cart. */
  async recordClick(rawCode: string): Promise<string | null> {
    if (!(await this.settings.getValue<boolean>("affiliates.enabled"))) return null;
    const affiliate = await this.findActiveByCode(rawCode);
    if (!affiliate) return null;
    const day = dayStart(new Date());
    await this.prisma.affiliateClickDay.upsert({ where: { affiliateId_day: { affiliateId: affiliate.id, day } }, update: { clicks: { increment: 1 } }, create: { affiliateId: affiliate.id, day, clicks: 1 } });
    return affiliate.code;
  }

  /** Attributes a new order inside the order-creation transaction. Never throws for attribution problems — an order must not fail because of a partner link. */
  async attributeInTx(tx: Prisma.TransactionClient, input: AttributionInput): Promise<void> {
    if (!(await this.settings.getValue<boolean>("affiliates.enabled"))) return;
    let affiliate: Affiliate | null = null;
    let source: "coupon" | "link" = "coupon";
    if (input.discountIds.length > 0) {
      affiliate = await tx.affiliate.findFirst({ where: { discountId: { in: input.discountIds }, status: "active" } });
    }
    if (!affiliate && input.cartAffiliateCode) {
      const candidate = await this.findActiveByCode(input.cartAffiliateCode);
      const days = candidate?.attributionDays ?? (await this.settings.getValue<number>("affiliates.attributionDays"));
      if (candidate && withinAttributionWindow(input.cartAffiliateClickedAt, new Date(), days)) {
        affiliate = candidate;
        source = "link";
      }
    }
    if (!affiliate) return;
    // No commission on the partner's own purchases.
    if (affiliate.phone && input.phone && affiliate.phone === input.phone) return;

    const base = commissionBase(
      input.lines.map((l) => ({ ...l, rejectedQty: 0, returnedQty: 0 })),
      input.orderLevelDiscounts,
    );
    const commission = computeCommission(base, { type: affiliate.commissionType, value: affiliate.commissionValue });
    await tx.affiliateConversion.create({ data: { affiliateId: affiliate.id, orderId: input.orderId, source, orderAmount: base, commission } });
  }

  // ---------------------------------------------------------------------------
  // Sweep
  // ---------------------------------------------------------------------------

  /** Approves commissions on completed orders (recomputed for what the customer kept) and rejects ones whose orders failed. */
  async approvalSweep(): Promise<{ approved: number; rejected: number }> {
    const pending = await this.prisma.affiliateConversion.findMany({ where: { status: "pending" }, take: SWEEP_BATCH, orderBy: { createdAt: "asc" }, include: { affiliate: true } });
    let approved = 0;
    let rejected = 0;
    for (const conversion of pending) {
      const order = await this.prisma.order.findUnique({
        where: { id: conversion.orderId },
        select: { status: true, referralDiscount: true, pointsDiscount: true, items: { select: { lineTotal: true, discountAllocated: true, quantity: true, rejectedQty: true, returnedQty: true } } },
      });
      if (!order || (REJECTING_STATUSES as readonly string[]).includes(order.status)) {
        await this.prisma.affiliateConversion.updateMany({ where: { id: conversion.id, status: "pending" }, data: { status: "rejected", rejectedReason: order ? `Order ${order.status}` : "Order deleted" } });
        rejected += 1;
        continue;
      }
      if (order.status !== "completed") continue;
      const base = commissionBase(order.items, order.referralDiscount + order.pointsDiscount);
      // Never more than first promised: a commission rule edited later doesn't reprice old orders.
      const commission = Math.min(conversion.commission, computeCommission(base, { type: conversion.affiliate.commissionType, value: conversion.affiliate.commissionValue }));
      const status = commission > 0 ? "approved" : "rejected";
      await this.prisma.affiliateConversion.updateMany({
        where: { id: conversion.id, status: "pending" },
        data: { status, orderAmount: base, commission, approvedAt: status === "approved" ? new Date() : null, rejectedReason: status === "rejected" ? "Nothing kept after returns" : null },
      });
      if (status === "approved") approved += 1;
      else rejected += 1;
    }
    return { approved, rejected };
  }

  // ---------------------------------------------------------------------------
  // Partner portal (private link, read-only)
  // ---------------------------------------------------------------------------

  async portal(token: string) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { portalToken: token } });
    if (!affiliate) throw new NotFoundException({ code: "AFFILIATE_NOT_FOUND", message: "This link isn't valid." });
    const since = dayStart(new Date(Date.now() - 29 * 86_400_000));
    const [clickDays, recent, coupon, balances] = await Promise.all([
      this.prisma.affiliateClickDay.findMany({ where: { affiliateId: affiliate.id, day: { gte: since } }, orderBy: { day: "asc" } }),
      this.prisma.affiliateConversion.findMany({ where: { affiliateId: affiliate.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, source: true, orderAmount: true, commission: true, status: true, createdAt: true } }),
      affiliate.discountId ? this.prisma.discount.findUnique({ where: { id: affiliate.discountId }, select: { code: true } }) : null,
      this.balances(affiliate.id),
    ]);
    return {
      name: affiliate.name,
      code: affiliate.code,
      status: affiliate.status,
      link: this.linkFor(affiliate.code),
      couponCode: coupon?.code ?? null,
      commission: { type: affiliate.commissionType, value: affiliate.commissionValue },
      clickDays: clickDays.map((d) => ({ day: d.day.toISOString().slice(0, 10), clicks: d.clicks })),
      recent,
      balances: { pending: balances.pending, approved: balances.approved, paid: balances.paid },
    };
  }
}

/** Midnight of the current Dhaka calendar day, as the UTC date Postgres stores in a `date` column. */
function dayStart(at: Date): Date {
  const { year, month, day } = dhakaParts(at);
  return new Date(Date.UTC(year, month, day));
}

/** Payout details aren't secret but don't need to sit in every audit diff. */
function redact(affiliate: Affiliate) {
  return { ...affiliate, portalToken: undefined, payoutDetails: affiliate.payoutDetails ? "•••" : null };
}
