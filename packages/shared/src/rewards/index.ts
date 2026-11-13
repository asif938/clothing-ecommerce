/**
 * Loyalty extensions maths (docs/PROJECT_SPEC.md §5.8, §6.3 step 9, §6.12,
 * §16 M16): gift card codes, how gift cards and store credit pay for an
 * order, the referee's first-order discount, referral eligibility and
 * affiliate commission. Pure and integer-only (golden rule 3) — the API
 * wraps these in transactions; nothing here touches I/O.
 */

// ---------------------------------------------------------------------------
// Gift card codes
// ---------------------------------------------------------------------------

/** Crockford-style alphabet without 0/O/1/I/L/U so codes survive being read out over the phone. */
export const GIFT_CARD_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const GIFT_CARD_CODE_LENGTH = 16;

/**
 * Builds a code from random bytes (the caller passes `crypto.randomBytes`
 * output so this stays isomorphic). Rejection sampling keeps every
 * character uniformly likely: 30^16 ≈ 4.3e23 codes.
 */
export function giftCardCodeFromBytes(bytes: Uint8Array): string {
  const limit = 256 - (256 % GIFT_CARD_ALPHABET.length);
  let code = "";
  for (const byte of bytes) {
    if (byte >= limit) continue;
    code += GIFT_CARD_ALPHABET[byte % GIFT_CARD_ALPHABET.length];
    if (code.length === GIFT_CARD_CODE_LENGTH) return code;
  }
  throw new Error("Not enough random bytes for a gift card code");
}

/** What a shopper typed → the canonical code: upper-case with spaces and separators dropped. */
export function normalizeGiftCardCode(input: string): string {
  return input.toUpperCase().replace(/[\s\-_.]/g, "");
}

/** True when a normalized code could have been issued by us — cheap pre-check before any database lookup. */
export function isGiftCardCodeShape(code: string): boolean {
  if (code.length !== GIFT_CARD_CODE_LENGTH) return false;
  for (const char of code) if (!GIFT_CARD_ALPHABET.includes(char)) return false;
  return true;
}

/** `ABCD-EFGH-JKMN-PQRS` for messages and screens. */
export function formatGiftCardCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

export interface GiftCardAmountRules {
  /** Preset amounts shown as buttons, poisha. */
  presets: number[];
  allowCustom: boolean;
  minAmount: number;
  maxAmount: number;
}

export type GiftCardAmountRejection = "NOT_A_PRESET" | "BELOW_MINIMUM" | "ABOVE_MAXIMUM" | "NOT_WHOLE_TAKA";

/** A storefront gift card purchase amount is either a preset or, when custom amounts are on, any whole-taka amount within the range. */
export function validateGiftCardAmount(amount: number, rules: GiftCardAmountRules): GiftCardAmountRejection | null {
  if (!Number.isInteger(amount) || amount % 100 !== 0) return "NOT_WHOLE_TAKA";
  if (rules.presets.includes(amount)) return null;
  if (!rules.allowCustom) return "NOT_A_PRESET";
  if (amount < rules.minAmount) return "BELOW_MINIMUM";
  if (amount > rules.maxAmount) return "ABOVE_MAXIMUM";
  return null;
}

export type GiftCardState = "pending" | "active" | "disabled" | "redeemed" | "expired" | "cancelled";
export type GiftCardUnusableReason = "NOT_ACTIVE" | "EXPIRED" | "NO_BALANCE";

/** Why a card can't pay right now, or null when it can. The stored status may lag the expiry date (the sweep runs periodically), so expiry is checked here too. */
export function giftCardUnusableReason(card: { status: GiftCardState; balance: number; expiresAt: Date | null }, now: Date): GiftCardUnusableReason | null {
  if (card.status === "expired" || (card.expiresAt !== null && card.expiresAt.getTime() <= now.getTime())) return "EXPIRED";
  if (card.status !== "active") return "NOT_ACTIVE";
  if (card.balance <= 0) return "NO_BALANCE";
  return null;
}

// ---------------------------------------------------------------------------
// Tenders at checkout
// ---------------------------------------------------------------------------

export interface CreditAllocationInput {
  /** What the order still costs after discounts, points and shipping, poisha. */
  amountDue: number;
  giftCardBalance: number;
  storeCreditBalance: number;
  useStoreCredit: boolean;
}

export interface CreditAllocation {
  giftCard: number;
  storeCredit: number;
  /** Left to pay by COD or online. */
  remaining: number;
}

/**
 * Gift card first (it can expire and belongs to whoever holds the code),
 * then the wallet. Both pay for the whole order, shipping included — they
 * are money already received, unlike points (docs/DECISIONS.md).
 */
export function allocateCredits(input: CreditAllocationInput): CreditAllocation {
  const due = Math.max(0, input.amountDue);
  const giftCard = Math.min(due, Math.max(0, input.giftCardBalance));
  const storeCredit = input.useStoreCredit ? Math.min(due - giftCard, Math.max(0, input.storeCreditBalance)) : 0;
  return { giftCard, storeCredit, remaining: due - giftCard - storeCredit };
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

export interface ReferralDiscountRules {
  type: "percent" | "fixed";
  /** Percent (1–100) or poisha. */
  value: number;
  /** Cap for percent discounts, poisha; 0 = no cap. */
  maxDiscount: number;
  /** Goods total the first order needs, poisha; 0 = none. */
  minOrder: number;
}

/** The referee's first-order discount on `goodsTotal` (after coupon discounts). Never more than the goods. */
export function computeReferralDiscount(goodsTotal: number, rules: ReferralDiscountRules): number {
  if (goodsTotal <= 0 || rules.value <= 0) return 0;
  if (rules.minOrder > 0 && goodsTotal < rules.minOrder) return 0;
  const raw = rules.type === "percent" ? Math.floor((goodsTotal * Math.min(100, rules.value)) / 100) : rules.value;
  const capped = rules.type === "percent" && rules.maxDiscount > 0 ? Math.min(raw, rules.maxDiscount) : raw;
  return Math.min(goodsTotal, capped);
}

export type ReferralRejection = "UNKNOWN_CODE" | "SELF_REFERRAL" | "NOT_FIRST_ORDER" | "ALREADY_REFERRED" | "REFERRER_INACTIVE" | "COUPON_IN_USE" | "BELOW_MINIMUM";

export interface ReferralCheckInput {
  referrer: { id: string; phone: string | null; status: "active" | "blocked" } | null;
  /** The shopper placing the order. */
  refereeCustomerId: string | null;
  refereePhone: string | null;
  /** Orders already placed by this customer or phone. */
  refereePreviousOrders: number;
  refereeAlreadyReferred: boolean;
  couponApplied: boolean;
  combinableWithCoupons: boolean;
}

/** Whether a referral code can give this shopper the first-order discount (§6.12: the referee gets a first-order discount). */
export function checkReferral(input: ReferralCheckInput): ReferralRejection | null {
  if (!input.referrer) return "UNKNOWN_CODE";
  if (input.referrer.status !== "active") return "REFERRER_INACTIVE";
  if (input.refereeCustomerId !== null && input.refereeCustomerId === input.referrer.id) return "SELF_REFERRAL";
  if (input.refereePhone !== null && input.referrer.phone !== null && input.refereePhone === input.referrer.phone) return "SELF_REFERRAL";
  if (input.refereePreviousOrders > 0) return "NOT_FIRST_ORDER";
  if (input.refereeAlreadyReferred) return "ALREADY_REFERRED";
  if (input.couponApplied && !input.combinableWithCoupons) return "COUPON_IN_USE";
  return null;
}

/** Referral codes are upper-case hex (see CustomersService); anything else can't be one. */
export function normalizeReferralCode(input: string): string {
  return input.trim().toUpperCase();
}

export function looksLikeReferralCode(code: string): boolean {
  return /^[0-9A-F]{8,12}$/.test(code);
}

// ---------------------------------------------------------------------------
// Affiliates
// ---------------------------------------------------------------------------

export interface CommissionRule {
  type: "percent" | "fixed";
  /** Percent in basis points (1000 = 10%) or poisha per order. */
  value: number;
}

/** Commission on `base` poisha, rounded down; a fixed commission never exceeds the base. */
export function computeCommission(base: number, rule: CommissionRule): number {
  if (base <= 0 || rule.value <= 0) return 0;
  if (rule.type === "fixed") return Math.min(base, rule.value);
  return Math.floor((base * Math.min(10_000, rule.value)) / 10_000);
}

export interface CommissionBaseLine {
  lineTotal: number;
  discountAllocated: number;
  quantity: number;
  rejectedQty: number;
  returnedQty: number;
}

/**
 * What an affiliate earns on: goods the customer kept, after coupon and
 * referral discounts and points (shipping and gift wrap never count). Used
 * at placement (nothing returned yet) and again at approval, so returns
 * within the window shrink the commission.
 */
export function commissionBase(lines: CommissionBaseLine[], orderLevelDiscounts: number): number {
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
  const share = Math.ceil((Math.max(0, orderLevelDiscounts) * keptNet) / fullNet);
  return Math.max(0, keptNet - share);
}

/** A link click counts for `days` days; 0 days means "this session only", which we treat as 1 day. */
export function withinAttributionWindow(clickedAt: Date | null, now: Date, days: number): boolean {
  if (!clickedAt) return false;
  const windowMs = Math.max(1, days) * 24 * 60 * 60 * 1000;
  const age = now.getTime() - clickedAt.getTime();
  return age >= 0 && age <= windowMs;
}

/** Affiliate codes: 3–24 letters, digits, dash or underscore; stored upper-case. */
export function normalizeAffiliateCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isAffiliateCodeShape(code: string): boolean {
  return /^[A-Z0-9_-]{3,24}$/.test(code);
}
