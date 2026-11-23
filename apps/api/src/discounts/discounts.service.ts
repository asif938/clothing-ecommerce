import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Discount, type DiscountValueType } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { ExperimentAssignmentsService } from "../experiments/experiment-assignments.service";
import type { AuthenticatedStaff } from "../common/types";
import {
  allocateProportionally,
  canCombine,
  computeDiscountAmount,
  conditionsMatchCart,
  eligibleSubtotal,
  lineIsEligible,
  violatesMarginGuard,
  type CombinableWith,
  type DiscountConditions,
  type DiscountContext,
  type DiscountLine,
} from "./discount-math";
import type { CreateDiscountDto, GenerateBulkCodesDto, UpdateDiscountDto } from "./dto";

export interface CartLineForPricing extends DiscountLine {
  unitPrice: number;
  costPrice: number | null;
}

export interface AppliedDiscount {
  discountId: string;
  code: string | null;
  type: "automatic" | "code";
  valueType: DiscountValueType;
  amount: number;
  allocations: Map<string, number>;
  freeShipping: boolean;
  combinable: CombinableWith;
  marginGuardOverride: boolean;
}

export interface RejectedCode {
  code: string;
  reasonCode: string;
  message: string;
}

export interface EvaluateResult {
  applied: AppliedDiscount[];
  rejectedCodes: RejectedCode[];
  totalDiscount: number;
  freeShipping: boolean;
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

/** Discounts — code + automatic, basic (docs/PROJECT_SPEC.md §5.8, §6.1, §6.3). Admin "full UI" (bulk unique codes, visual campaign builder) is M8's job — see docs/DECISIONS.md; this is the engine plus a minimal CRUD API. */
@Injectable()
export class DiscountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly experiments: ExperimentAssignmentsService,
  ) {}

  list() {
    return this.prisma.discount.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "desc" }] });
  }

  async get(id: string) {
    const discount = await this.prisma.discount.findUnique({ where: { id } });
    if (!discount) throw new NotFoundException("Discount not found");
    return discount;
  }

  async create(dto: CreateDiscountDto, actor: AuthenticatedStaff) {
    const { conditions, limits, combinableWith, ...rest } = dto;
    const discount = await this.prisma.discount.create({
      data: { ...rest, conditions: toJsonInput(conditions), limits: toJsonInput(limits), combinableWith: toJsonInput(combinableWith) },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "discount.create", entityType: "discount", entityId: discount.id, after: discount });
    return discount;
  }

  async update(id: string, dto: UpdateDiscountDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const { conditions, limits, combinableWith, ...rest } = dto;
    const discount = await this.prisma.discount.update({
      where: { id },
      data: {
        ...rest,
        ...(conditions !== undefined ? { conditions: toJsonInput(conditions) } : {}),
        ...(limits !== undefined ? { limits: toJsonInput(limits) } : {}),
        ...(combinableWith !== undefined ? { combinableWith: toJsonInput(combinableWith) } : {}),
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "discount.update", entityType: "discount", entityId: id, before, after: discount });
    return discount;
  }

  async remove(id: string, actor: AuthenticatedStaff): Promise<void> {
    const before = await this.get(id);
    await this.prisma.discount.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "discount.delete", entityType: "discount", entityId: id, before });
  }

  private isWithinSchedule(discount: Discount, now: Date): boolean {
    if (discount.status !== "active") return false;
    if (discount.startsAt && discount.startsAt > now) return false;
    if (discount.endsAt && discount.endsAt < now) return false;
    return true;
  }

  private async withinLimits(discount: Discount, customerId: string | null, phone: string | null): Promise<boolean> {
    const limits = (discount.limits as { totalUses?: number; perCustomer?: number; perPhone?: number } | null) ?? {};
    if (limits.totalUses !== undefined && discount.usedCount >= limits.totalUses) return false;
    if (limits.perCustomer !== undefined && customerId) {
      const count = await this.prisma.discountUsage.count({ where: { discountId: discount.id, customerId } });
      if (count >= limits.perCustomer) return false;
    }
    if (limits.perPhone !== undefined && phone) {
      const count = await this.prisma.discountUsage.count({ where: { discountId: discount.id, phone } });
      if (count >= limits.perPhone) return false;
    }
    return true;
  }

  /** §6.3 steps 3-4-5 — automatic discounts, then entered codes, then the margin guard. Lines must carry `unitPrice`/`costPrice` for the guard to run. */
  async evaluate(
    lines: CartLineForPricing[],
    context: DiscountContext,
    enteredCodes: string[],
    customerId: string | null,
    phone: string | null,
    visitorId: string | null = null,
  ): Promise<EvaluateResult> {
    const now = new Date();
    const applied: AppliedDiscount[] = [];
    const rejectedCodes: RejectedCode[] = [];
    // §16 M14 offer A/B tests: a discount owned by a running offer experiment only applies to visitors in its variant.
    const offerGate = await this.experiments.offerGate(visitorId);
    const blockedByExperiment = (discountId: string) => offerGate.gated.has(discountId) && !offerGate.allowed.has(discountId);

    const automaticCandidates = await this.prisma.discount.findMany({ where: { type: "automatic" }, orderBy: { priority: "desc" } });
    for (const discount of automaticCandidates) {
      if (!this.isWithinSchedule(discount, now)) continue;
      if (blockedByExperiment(discount.id)) continue;
      const conditions = (discount.conditions as DiscountConditions | null) ?? {};
      if (!conditionsMatchCart(conditions, context)) continue;
      if (!(await this.withinLimits(discount, customerId, phone))) continue;
      const combinable = (discount.combinableWith as CombinableWith | null) ?? {};
      if (!canCombine("automatic", combinable, applied.map((a) => ({ type: a.type, combinable: a.combinable })))) continue;

      const eligibleLines = lines.filter((l) => lineIsEligible(l, conditions));
      const eligibleAmt = eligibleSubtotal(eligibleLines, conditions);
      const amount = computeDiscountAmount(discount.valueType, discount.value, eligibleAmt);
      if (amount <= 0 && discount.valueType !== "free_shipping") continue;
      applied.push({
        discountId: discount.id,
        code: null,
        type: "automatic",
        valueType: discount.valueType,
        amount,
        allocations: allocateProportionally(amount, eligibleLines),
        freeShipping: discount.valueType === "free_shipping",
        combinable,
        marginGuardOverride: discount.marginGuardOverride,
      });
    }

    const maxCodes = await this.settings.getValue<number>("checkout.maxCouponCodesPerOrder");
    const uniqueCodes = [...new Set(enteredCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))].slice(0, maxCodes);
    for (const code of uniqueCodes) {
      // §16 M8 "bulk unique codes": a code may be the discount's own shared
      // `code` field, or one of many rows in `discount_codes` (e.g. 500
      // distinct single-use codes generated for one "VIP10" discount) —
      // either resolves to the same underlying `Discount`.
      const sharedDiscount = await this.prisma.discount.findFirst({ where: { code, type: "code" } });
      const bulkCode = sharedDiscount ? null : await this.prisma.discountCode.findUnique({ where: { code }, include: { discount: true } });
      const discount = sharedDiscount ?? bulkCode?.discount ?? null;
      if (!discount) {
        rejectedCodes.push({ code, reasonCode: "NOT_FOUND", message: "This code does not exist." });
        continue;
      }
      // §16 M13 unique-code campaigns: a code minted for one customer only works on that customer's account.
      if (bulkCode?.assignedTo && bulkCode.assignedTo !== customerId) {
        rejectedCodes.push({ code, reasonCode: "NOT_YOURS", message: customerId ? "This code belongs to another customer." : "Log in to use this personal code." });
        continue;
      }
      // Bulk codes are single-use (§16 M8): one redemption per minted code. Claimed atomically at order placement (`claimBulkCodesInTx`).
      if (bulkCode && bulkCode.usedCount >= 1) {
        rejectedCodes.push({ code, reasonCode: "LIMIT_REACHED", message: "This code has already been used." });
        continue;
      }
      if (!this.isWithinSchedule(discount, now) || blockedByExperiment(discount.id)) {
        rejectedCodes.push({ code, reasonCode: "NOT_ACTIVE", message: "This code is not currently active." });
        continue;
      }
      if (!(await this.withinLimits(discount, customerId, phone))) {
        rejectedCodes.push({ code, reasonCode: "LIMIT_REACHED", message: "This code has reached its usage limit." });
        continue;
      }
      const conditions = (discount.conditions as DiscountConditions | null) ?? {};
      if (!conditionsMatchCart(conditions, context)) {
        rejectedCodes.push({ code, reasonCode: "CONDITIONS_NOT_MET", message: "Your cart doesn't meet this code's requirements." });
        continue;
      }
      const combinable = (discount.combinableWith as CombinableWith | null) ?? {};
      if (!canCombine("code", combinable, applied.map((a) => ({ type: a.type, combinable: a.combinable })))) {
        rejectedCodes.push({ code, reasonCode: "NOT_COMBINABLE", message: "This code can't be combined with another discount already applied." });
        continue;
      }

      const eligibleLines = lines.filter((l) => lineIsEligible(l, conditions));
      const eligibleAmt = eligibleSubtotal(eligibleLines, conditions);
      const amount = computeDiscountAmount(discount.valueType, discount.value, eligibleAmt);
      if (amount <= 0 && discount.valueType !== "free_shipping") {
        rejectedCodes.push({ code, reasonCode: "NO_EFFECT", message: "This code wouldn't change your total." });
        continue;
      }
      applied.push({
        discountId: discount.id,
        code,
        type: "code",
        valueType: discount.valueType,
        amount,
        allocations: allocateProportionally(amount, eligibleLines),
        freeShipping: discount.valueType === "free_shipping",
        combinable,
        marginGuardOverride: discount.marginGuardOverride,
      });
    }

    await this.applyMarginGuard(applied, lines);

    const totalDiscount = applied.reduce((sum, a) => sum + a.amount, 0);
    const freeShipping = applied.some((a) => a.freeShipping);
    return { applied, rejectedCodes, totalDiscount, freeShipping };
  }

  private async applyMarginGuard(applied: AppliedDiscount[], lines: CartLineForPricing[]): Promise<void> {
    const enabled = await this.settings.getValue<boolean>("pricing.marginGuard.enabled");
    if (!enabled) return;
    const minMarginPercent = await this.settings.getValue<number>("pricing.marginGuard.minMarginPercent");
    const blockWhole = await this.settings.getValue<boolean>("pricing.marginGuard.blockWholeDiscount");
    const lineById = new Map(lines.map((l) => [l.variantId, l]));

    for (const discount of [...applied]) {
      if (discount.marginGuardOverride) continue;
      for (const [variantId, allocated] of discount.allocations) {
        const line = lineById.get(variantId);
        if (!line) continue;
        const violates = violatesMarginGuard({ variantId, costPrice: line.costPrice, unitPrice: line.unitPrice, quantity: line.quantity, allocatedDiscount: allocated }, minMarginPercent);
        if (!violates) continue;
        if (blockWhole) {
          const index = applied.indexOf(discount);
          if (index >= 0) applied.splice(index, 1);
          break;
        }
        discount.amount -= allocated;
        discount.allocations.set(variantId, 0);
      }
    }
  }

  /** Runs inside the order-creation transaction, so a usage row can never outlive (or go missing from) its order. */
  async recordUsageInTx(tx: Prisma.TransactionClient, discountId: string, orderId: string, customerId: string | null, phone: string | null, amount: number, code: string | null): Promise<void> {
    await tx.discountUsage.create({ data: { discountId, orderId, customerId, phone, amount, code } });
    await tx.discount.update({ where: { id: discountId }, data: { usedCount: { increment: 1 } } });
    // Bulk codes' own `usedCount` is not touched here — it was already claimed in the same transaction (`claimBulkCodesInTx`).
  }

  /**
   * Claims each single-use bulk code inside the order transaction: `used_count` only moves 0 → 1 under the row lock,
   * so two checkouts racing with the same code can't both succeed — the loser's whole order rolls back.
   */
  async claimBulkCodesInTx(tx: Prisma.TransactionClient, applied: { discountId: string; code: string | null }[]): Promise<void> {
    for (const { discountId, code } of applied) {
      if (!code) continue;
      const row = await tx.discountCode.findUnique({ where: { code }, select: { id: true, discountId: true } });
      if (!row || row.discountId !== discountId) continue; // a shared `Discount.code`, not a bulk code
      const { count } = await tx.discountCode.updateMany({ where: { id: row.id, usedCount: { lt: 1 } }, data: { usedCount: { increment: 1 } } });
      if (count === 0) throw new BadRequestException({ code: "CODE_ALREADY_USED", message: `The code ${code} has already been used.` });
    }
  }

  /** §16 M8 "bulk unique code generator" — e.g. 500 distinct single-use codes for one `code`-type discount, each individually trackable in `discount_codes`. */
  async generateBulkCodes(discountId: string, dto: GenerateBulkCodesDto, actor: AuthenticatedStaff): Promise<{ codes: string[] }> {
    const discount = await this.get(discountId);
    if (discount.type !== "code") {
      throw new Error("Bulk codes can only be generated for a code-type discount");
    }

    const codes: string[] = [];
    const prefix = dto.prefix?.toUpperCase() ?? "";
    while (codes.length < dto.count) {
      const remaining = dto.count - codes.length;
      const batch = Array.from({ length: remaining }, () => `${prefix}${randomBytes(Math.ceil(dto.codeLength / 2)).toString("hex").toUpperCase().slice(0, dto.codeLength)}`);
      const unique = [...new Set(batch)];
      const existing = await this.prisma.discountCode.findMany({ where: { code: { in: unique } }, select: { code: true } });
      const existingCodes = new Set(existing.map((e) => e.code));
      for (const code of unique) {
        if (!existingCodes.has(code) && codes.length < dto.count) codes.push(code);
      }
    }

    await this.prisma.discountCode.createMany({ data: codes.map((code) => ({ discountId, code })) });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "discount.bulk_codes_generated", entityType: "discount", entityId: discountId, after: { count: codes.length } });
    return { codes };
  }

  listBulkCodes(discountId: string) {
    return this.prisma.discountCode.findMany({ where: { discountId }, orderBy: { createdAt: "desc" } });
  }

  /** §8.2 "usage reports" — total uses/amount plus a recent list; the Reports module's discount report (§8.2 "marketing: discount usage") aggregates across *all* discounts, this is the single-discount drill-down shown on its own admin page. */
  async usageReport(discountId: string) {
    const [totals, recent] = await Promise.all([
      this.prisma.discountUsage.aggregate({ where: { discountId }, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.discountUsage.findMany({ where: { discountId }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    return { totalUses: totals._count._all, totalAmount: totals._sum.amount ?? 0, recent };
  }
}
