import { estimateSmsLength } from "../notifications/sms-length.ts";
import type { AdPlatform, AdSpendSourceMap } from "../settings/definitions-m13.ts";

/**
 * Broadcast cost estimates and ROAS attribution (docs/PROJECT_SPEC.md §8.2
 * Marketing "broadcasts … cost estimate", "Ad spend import (CSV) and ROAS
 * report", §16 M13). Pure; money in poisha.
 */

export type BroadcastChannel = "sms" | "whatsapp" | "email" | "push";

export interface BroadcastCostRates {
  smsPerSegment: number;
  whatsappPerMessage: number;
  emailPerMessage: number;
}

export interface BroadcastCostInput {
  channel: BroadcastChannel;
  /** Recipients per locale — the body length (and so SMS segments) differs by language. */
  recipients: { bn: number; en: number };
  /** Sample-rendered bodies (variables filled with realistic-length values). */
  bodies: { bn: string; en: string };
}

export interface BroadcastCostEstimate {
  recipients: number;
  /** SMS segments per message per locale (0 for other channels). */
  segments: { bn: number; en: number };
  encoding: { bn: "gsm7" | "unicode" | null; en: "gsm7" | "unicode" | null };
  totalCost: number;
}

export function estimateBroadcastCost(input: BroadcastCostInput, rates: BroadcastCostRates): BroadcastCostEstimate {
  const recipients = input.recipients.bn + input.recipients.en;
  if (input.channel === "sms") {
    const bn = estimateSmsLength(input.bodies.bn);
    const en = estimateSmsLength(input.bodies.en);
    return {
      recipients,
      segments: { bn: bn.segments, en: en.segments },
      encoding: { bn: bn.encoding, en: en.encoding },
      totalCost: (input.recipients.bn * bn.segments + input.recipients.en * en.segments) * rates.smsPerSegment,
    };
  }
  const perMessage = input.channel === "whatsapp" ? rates.whatsappPerMessage : input.channel === "email" ? rates.emailPerMessage : 0;
  return { recipients, segments: { bn: 0, en: 0 }, encoding: { bn: null, en: null }, totalCost: recipients * perMessage };
}

/** Which ad platform an order's `utm_source` belongs to, per the admin-editable map; null when it's not paid traffic we know. */
export function platformForUtmSource(source: string | null | undefined, map: AdSpendSourceMap): AdPlatform | null {
  if (!source) return null;
  const needle = source.trim().toLowerCase();
  for (const [platform, sources] of Object.entries(map) as [AdPlatform, string[] | undefined][]) {
    if (sources?.some((s) => s.trim().toLowerCase() === needle)) return platform;
  }
  return null;
}

export interface SpendRow {
  platform: AdPlatform;
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
}

export interface AttributedOrder {
  utmSource: string | null;
  utmCampaign: string | null;
  revenue: number;
}

export interface RoasRow {
  platform: AdPlatform;
  campaignKey: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  orders: number;
  revenue: number;
  /** Revenue ÷ spend, or null when nothing was spent (display-only ratio, not money). */
  roas: number | null;
  /** Spend per order (poisha), null without orders. */
  costPerOrder: number | null;
}

export const UNMATCHED_CAMPAIGN = "(unmatched)";

function norm(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Joins imported spend with orders: an order counts for a campaign when its
 * platform matches (via utm_source) and its utm_campaign equals the
 * campaign's id or name (case-insensitive). Paid-platform orders with no
 * matching campaign land in an "(unmatched)" row per platform so revenue is
 * never silently dropped.
 */
export function computeRoas(spend: SpendRow[], orders: AttributedOrder[], sourceMap: AdSpendSourceMap): RoasRow[] {
  const rows = new Map<string, RoasRow>();
  const lookup = new Map<string, string>(); // `${platform}|${id-or-name}` → row key

  for (const s of spend) {
    const key = `${s.platform}|${norm(s.campaignId || s.campaignName)}`;
    const row = rows.get(key) ?? { platform: s.platform, campaignKey: s.campaignId || s.campaignName, campaignName: s.campaignName, spend: 0, impressions: 0, clicks: 0, orders: 0, revenue: 0, roas: null, costPerOrder: null };
    row.spend += s.spend;
    row.impressions += s.impressions;
    row.clicks += s.clicks;
    rows.set(key, row);
    if (s.campaignId) lookup.set(`${s.platform}|${norm(s.campaignId)}`, key);
    if (s.campaignName) lookup.set(`${s.platform}|${norm(s.campaignName)}`, key);
  }

  for (const o of orders) {
    const platform = platformForUtmSource(o.utmSource, sourceMap);
    if (!platform) continue;
    const matched = o.utmCampaign ? lookup.get(`${platform}|${norm(o.utmCampaign)}`) : undefined;
    const key = matched ?? `${platform}|${UNMATCHED_CAMPAIGN}`;
    const row = rows.get(key) ?? { platform, campaignKey: UNMATCHED_CAMPAIGN, campaignName: UNMATCHED_CAMPAIGN, spend: 0, impressions: 0, clicks: 0, orders: 0, revenue: 0, roas: null, costPerOrder: null };
    row.orders += 1;
    row.revenue += o.revenue;
    rows.set(key, row);
  }

  return [...rows.values()]
    .map((row) => ({ ...row, roas: row.spend > 0 ? row.revenue / row.spend : null, costPerOrder: row.orders > 0 && row.spend > 0 ? Math.round(row.spend / row.orders) : null }))
    .sort((a, b) => b.spend - a.spend || b.revenue - a.revenue);
}
