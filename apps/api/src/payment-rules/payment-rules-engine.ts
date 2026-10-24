/**
 * Payment rules engine (docs/PROJECT_SPEC.md §6.5) — pure functions,
 * unit-tested. Evaluated in priority order; `stopProcessing` skips later
 * rules; actions from multiple matching rules merge with the **strictest**
 * outcome winning.
 */

export interface RuleConditions {
  match?: "all" | "any";
  totalMin?: number;
  totalMax?: number;
  subtotalMin?: number;
  subtotalMax?: number;
  itemCountMin?: number;
  itemCountMax?: number;
  zoneIds?: string[];
  districtIds?: string[];
  areaIds?: string[];
  isDhakaCity?: boolean;
  customerTypes?: ("guest" | "registered" | "new" | "returning")[];
  ordersCountMin?: number;
  deliveredCountMin?: number;
  rejectionRateMin?: number;
  customerTags?: string[];
  riskLevels?: ("low" | "medium" | "high")[];
  riskScoreMin?: number;
  categoryIds?: string[];
  productIds?: string[];
  cartTags?: string[];
  hasFlashSaleItem?: boolean;
  paymentMethods?: string[];
  dayOfWeek?: number[];
  hourRange?: [number, number];
  utmSources?: string[];
  phoneBlocked?: boolean;
}

export interface RuleContext {
  total: number;
  subtotal: number;
  itemCount: number;
  zoneId: string | null;
  districtId: string;
  areaId: string;
  isDhakaCity: boolean;
  customerType: "guest" | "registered" | "new" | "returning";
  ordersCount: number;
  deliveredCount: number;
  rejectionRate: number;
  customerTags: string[];
  riskLevel: "low" | "medium" | "high" | null;
  riskScore: number | null;
  categoryIds: string[];
  productIds: string[];
  cartTags: string[];
  hasFlashSaleItem: boolean;
  paymentMethod: string | null;
  now: Date;
  utmSource: string | null;
  phoneBlocked: boolean;
}

type ConditionCheck = [boolean, boolean]; // [present, matched]

function checks(conditions: RuleConditions, ctx: RuleContext): boolean[] {
  const results: ConditionCheck[] = [
    [conditions.totalMin !== undefined, ctx.total >= (conditions.totalMin ?? 0)],
    [conditions.totalMax !== undefined, ctx.total <= (conditions.totalMax ?? Infinity)],
    [conditions.subtotalMin !== undefined, ctx.subtotal >= (conditions.subtotalMin ?? 0)],
    [conditions.subtotalMax !== undefined, ctx.subtotal <= (conditions.subtotalMax ?? Infinity)],
    [conditions.itemCountMin !== undefined, ctx.itemCount >= (conditions.itemCountMin ?? 0)],
    [conditions.itemCountMax !== undefined, ctx.itemCount <= (conditions.itemCountMax ?? Infinity)],
    [!!conditions.zoneIds, !!ctx.zoneId && !!conditions.zoneIds?.includes(ctx.zoneId)],
    [!!conditions.districtIds, !!conditions.districtIds?.includes(ctx.districtId)],
    [!!conditions.areaIds, !!conditions.areaIds?.includes(ctx.areaId)],
    [conditions.isDhakaCity !== undefined, ctx.isDhakaCity === conditions.isDhakaCity],
    [!!conditions.customerTypes, !!conditions.customerTypes?.includes(ctx.customerType)],
    [conditions.ordersCountMin !== undefined, ctx.ordersCount >= (conditions.ordersCountMin ?? 0)],
    [conditions.deliveredCountMin !== undefined, ctx.deliveredCount >= (conditions.deliveredCountMin ?? 0)],
    [conditions.rejectionRateMin !== undefined, ctx.rejectionRate >= (conditions.rejectionRateMin ?? 0)],
    [!!conditions.customerTags, !!conditions.customerTags?.some((t) => ctx.customerTags.includes(t))],
    [!!conditions.riskLevels, !!ctx.riskLevel && !!conditions.riskLevels?.includes(ctx.riskLevel)],
    [conditions.riskScoreMin !== undefined, (ctx.riskScore ?? -1) >= (conditions.riskScoreMin ?? 0)],
    [!!conditions.categoryIds, !!conditions.categoryIds?.some((c) => ctx.categoryIds.includes(c))],
    [!!conditions.productIds, !!conditions.productIds?.some((p) => ctx.productIds.includes(p))],
    [!!conditions.cartTags, !!conditions.cartTags?.some((t) => ctx.cartTags.includes(t))],
    [conditions.hasFlashSaleItem !== undefined, ctx.hasFlashSaleItem === conditions.hasFlashSaleItem],
    [!!conditions.paymentMethods, !!ctx.paymentMethod && !!conditions.paymentMethods?.includes(ctx.paymentMethod)],
    [!!conditions.dayOfWeek, !!conditions.dayOfWeek?.includes(ctx.now.getDay())],
    [!!conditions.hourRange, isWithinHourRange(ctx.now.getHours(), conditions.hourRange)],
    [!!conditions.utmSources, !!ctx.utmSource && !!conditions.utmSources?.includes(ctx.utmSource)],
    [conditions.phoneBlocked !== undefined, ctx.phoneBlocked === conditions.phoneBlocked],
  ];
  return results.filter(([present]) => present).map(([, matched]) => matched);
}

function isWithinHourRange(hour: number, range?: [number, number]): boolean {
  if (!range) return false;
  const [start, end] = range;
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function conditionsMatch(conditions: RuleConditions, ctx: RuleContext): boolean {
  const results = checks(conditions, ctx);
  if (results.length === 0) return true;
  return conditions.match === "any" ? results.some(Boolean) : results.every(Boolean);
}

export type AdvanceKind = "delivery_fee" | "fixed" | "percent" | "full";

export interface RuleAction {
  type: "disable_cod" | "disable_method" | "require_advance" | "require_otp" | "require_manual_review" | "block_order" | "show_message";
  method?: string;
  kind?: AdvanceKind;
  amount?: number;
  percent?: number;
  message?: string;
}

export interface PaymentRule {
  id: string;
  priority: number;
  isActive: boolean;
  conditions: RuleConditions;
  actions: RuleAction[];
  stopProcessing: boolean;
}

export interface AdvanceRequirement {
  kind: AdvanceKind;
  amount?: number;
  percent?: number;
}

export interface PaymentRulesOutcome {
  disabledMethods: Set<string>;
  codDisabled: boolean;
  advanceRequired: AdvanceRequirement | null;
  otpRequired: boolean;
  manualReviewRequired: boolean;
  blocked: string | null;
  messages: string[];
  matchedRuleIds: string[];
}

const ADVANCE_STRICTNESS: Record<AdvanceKind, number> = { full: 3, percent: 2, fixed: 1, delivery_fee: 0 };

function stricterAdvance(a: AdvanceRequirement | null, b: AdvanceRequirement): AdvanceRequirement {
  if (!a) return b;
  if (ADVANCE_STRICTNESS[b.kind] > ADVANCE_STRICTNESS[a.kind]) return b;
  if (ADVANCE_STRICTNESS[b.kind] < ADVANCE_STRICTNESS[a.kind]) return a;
  // Same kind — the larger amount/percent is stricter.
  if (b.kind === "percent") return (b.percent ?? 0) > (a.percent ?? 0) ? b : a;
  if (b.kind === "fixed") return (b.amount ?? 0) > (a.amount ?? 0) ? b : a;
  return a;
}

export function evaluatePaymentRules(rules: PaymentRule[], ctx: RuleContext): PaymentRulesOutcome {
  const outcome: PaymentRulesOutcome = {
    disabledMethods: new Set(),
    codDisabled: false,
    advanceRequired: null,
    otpRequired: false,
    manualReviewRequired: false,
    blocked: null,
    messages: [],
    matchedRuleIds: [],
  };

  const sorted = [...rules].filter((r) => r.isActive).sort((a, b) => b.priority - a.priority);
  for (const rule of sorted) {
    if (!conditionsMatch(rule.conditions, ctx)) continue;
    outcome.matchedRuleIds.push(rule.id);

    for (const action of rule.actions) {
      switch (action.type) {
        case "disable_cod":
          outcome.codDisabled = true;
          outcome.disabledMethods.add("cod");
          break;
        case "disable_method":
          if (action.method) outcome.disabledMethods.add(action.method);
          break;
        case "require_advance":
          if (action.kind) outcome.advanceRequired = stricterAdvance(outcome.advanceRequired, { kind: action.kind, amount: action.amount, percent: action.percent });
          break;
        case "require_otp":
          outcome.otpRequired = true;
          break;
        case "require_manual_review":
          outcome.manualReviewRequired = true;
          break;
        case "block_order":
          outcome.blocked = action.message ?? "This order cannot be placed.";
          break;
        case "show_message":
          if (action.message) outcome.messages.push(action.message);
          break;
      }
    }

    if (rule.stopProcessing) break;
  }

  return outcome;
}
