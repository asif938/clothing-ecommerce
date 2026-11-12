/**
 * Loyalty points maths (docs/PROJECT_SPEC.md §6.12, §16 M13). Pure, integer
 * only — points are whole numbers and every money value is poisha (golden
 * rule 3). The API wraps these in transactions; nothing here touches I/O.
 */

export interface LoyaltyRules {
  /** Poisha a customer must spend to earn 1 point at a 100% multiplier (default ৳100). */
  spendPerPoint: number;
  /** Poisha one point is worth at checkout (default ৳1). */
  pointValue: number;
  minRedeemPoints: number;
  /** Max share of the goods total (after discounts) payable with points, 1–100. */
  maxRedeemPercent: number;
}

/** Points earned for `eligibleSpend` poisha with a tier multiplier given in percent (100 = 1×, 150 = 1.5×). Always rounds down. */
export function computeEarnPoints(eligibleSpend: number, spendPerPoint: number, multiplierPercent = 100): number {
  if (eligibleSpend <= 0 || spendPerPoint <= 0 || multiplierPercent <= 0) return 0;
  return Math.floor((eligibleSpend * multiplierPercent) / (spendPerPoint * 100));
}

export interface EarnableOrderLine {
  /** Pre-discount line total (unitPrice × quantity), poisha. */
  lineTotal: number;
  discountAllocated: number;
  quantity: number;
  rejectedQty: number;
  returnedQty: number;
}

/**
 * The spend a delivered order earns points on: each line's net (after its
 * discount share) for the units the customer actually kept, less any points
 * the customer paid with (points never earn points). Shipping, gift wrap
 * and refunded/rejected units don't count.
 */
export function eligibleSpendForOrder(lines: EarnableOrderLine[], pointsDiscount: number): number {
  let fullNet = 0;
  let keptNet = 0;
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const net = Math.max(0, line.lineTotal - line.discountAllocated);
    const kept = Math.max(0, line.quantity - line.rejectedQty - line.returnedQty);
    fullNet += net;
    keptNet += Math.floor((net * kept) / line.quantity);
  }
  if (keptNet === 0 || fullNet === 0) return 0;
  const pointsShare = Math.ceil((Math.max(0, pointsDiscount) * keptNet) / fullNet);
  return Math.max(0, keptNet - pointsShare);
}

export type RedemptionRejection = "NOT_REQUESTED" | "NO_BALANCE" | "BELOW_MINIMUM" | "CAP_BELOW_MINIMUM";

export interface RedemptionResult {
  points: number;
  /** Poisha taken off the order. */
  discount: number;
  rejection: RedemptionRejection | null;
  /** Most points this order could take, for the storefront's "use up to N" hint. */
  maxUsablePoints: number;
}

/**
 * How many of the requested points actually apply to an order whose goods
 * total (after coupon discounts) is `goodsTotal` poisha. The cap is a share
 * of goods only — shipping is never paid with points (docs/DECISIONS.md).
 */
export function computeRedemption(requestedPoints: number, balance: number, goodsTotal: number, rules: LoyaltyRules): RedemptionResult {
  const capPoisha = Math.floor((Math.max(0, goodsTotal) * Math.min(100, Math.max(0, rules.maxRedeemPercent))) / 100);
  const capPoints = rules.pointValue > 0 ? Math.floor(capPoisha / rules.pointValue) : 0;
  const maxUsablePoints = Math.max(0, Math.min(balance, capPoints));
  const none = (rejection: RedemptionRejection): RedemptionResult => ({ points: 0, discount: 0, rejection, maxUsablePoints: maxUsablePoints >= rules.minRedeemPoints ? maxUsablePoints : 0 });

  if (requestedPoints <= 0) return none("NOT_REQUESTED");
  if (balance <= 0) return none("NO_BALANCE");
  const usable = Math.min(requestedPoints, balance);
  if (usable < rules.minRedeemPoints) return none("BELOW_MINIMUM");
  const points = Math.min(usable, capPoints);
  if (points < rules.minRedeemPoints) return none("CAP_BELOW_MINIMUM");
  return { points, discount: points * rules.pointValue, rejection: null, maxUsablePoints };
}

export interface PointLot {
  id: string;
  remaining: number;
  expiresAt: Date | null;
}

export interface LotAllocation {
  id: string;
  take: number;
}

/** Spends `points` from earned lots, soonest-expiring first (never-expiring lots last), so redemptions never let points expire unnecessarily. */
export function consumeLotsFifo(lots: PointLot[], points: number): { allocations: LotAllocation[]; shortfall: number } {
  const ordered = [...lots]
    .filter((l) => l.remaining > 0)
    .sort((a, b) => {
      if (a.expiresAt === null && b.expiresAt === null) return 0;
      if (a.expiresAt === null) return 1;
      if (b.expiresAt === null) return -1;
      return a.expiresAt.getTime() - b.expiresAt.getTime();
    });
  const allocations: LotAllocation[] = [];
  let left = Math.max(0, points);
  for (const lot of ordered) {
    if (left === 0) break;
    const take = Math.min(lot.remaining, left);
    allocations.push({ id: lot.id, take });
    left -= take;
  }
  return { allocations, shortfall: left };
}

export interface TierThreshold {
  id: string;
  /** Lifetime spend (poisha) needed to reach the tier. */
  minSpent: number;
}

/** The highest tier whose threshold the customer has reached, or null when none applies. */
export function resolveTier<T extends TierThreshold>(tiers: T[], totalSpent: number): T | null {
  let best: T | null = null;
  for (const tier of tiers) {
    if (tier.minSpent <= totalSpent && (best === null || tier.minSpent > best.minSpent)) best = tier;
  }
  return best;
}

/** Adds whole months in UTC; day-of-month overflow rolls into the next month (Jan 31 + 1 → Mar 3), which is fine for an expiry date. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}
