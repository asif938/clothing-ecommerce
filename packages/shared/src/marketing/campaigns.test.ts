import { describe, expect, it } from "vitest";
import { computeRoas, estimateBroadcastCost, platformForUtmSource, UNMATCHED_CAMPAIGN } from "./campaigns.ts";

const RATES = { smsPerSegment: 35, whatsappPerMessage: 120, emailPerMessage: 5 };

describe("estimateBroadcastCost", () => {
  it("prices SMS by segments per locale (Bangla is unicode, so shorter segments)", () => {
    const bn = "আমাদের নতুন ঈদ কালেকশন এসেছে! আজই দেখুন এবং ১০% ছাড় পান। কোড: EID10. ধন্যবাদ!"; // > 70 unicode chars → 2 segments
    const en = "New Eid collection is live! Shop today and get 10% off with code EID10."; // GSM-7, 1 segment
    const estimate = estimateBroadcastCost({ channel: "sms", recipients: { bn: 100, en: 50 }, bodies: { bn, en } }, RATES);
    expect(estimate.encoding).toEqual({ bn: "unicode", en: "gsm7" });
    expect(estimate.segments).toEqual({ bn: 2, en: 1 });
    expect(estimate.totalCost).toBe((100 * 2 + 50 * 1) * 35);
    expect(estimate.recipients).toBe(150);
  });

  it("prices WhatsApp and email per message, push free", () => {
    const bodies = { bn: "x", en: "x" };
    expect(estimateBroadcastCost({ channel: "whatsapp", recipients: { bn: 10, en: 5 }, bodies }, RATES).totalCost).toBe(15 * 120);
    expect(estimateBroadcastCost({ channel: "email", recipients: { bn: 10, en: 5 }, bodies }, RATES).totalCost).toBe(15 * 5);
    expect(estimateBroadcastCost({ channel: "push", recipients: { bn: 10, en: 5 }, bodies }, RATES).totalCost).toBe(0);
  });
});

describe("platformForUtmSource", () => {
  const map = { meta: ["facebook", "ig"], google: ["google"] };
  it("matches case-insensitively", () => {
    expect(platformForUtmSource("Facebook", map)).toBe("meta");
    expect(platformForUtmSource(" IG ", map)).toBe("meta");
    expect(platformForUtmSource("google", map)).toBe("google");
  });
  it("returns null for unknown or empty sources", () => {
    expect(platformForUtmSource("newsletter", map)).toBeNull();
    expect(platformForUtmSource(null, map)).toBeNull();
  });
});

describe("computeRoas", () => {
  const map = { meta: ["facebook"], google: ["google"] };

  it("joins spend with orders by campaign id or name", () => {
    const rows = computeRoas(
      [
        { platform: "meta", campaignId: "123", campaignName: "Eid Sale", spend: 500_000, impressions: 10_000, clicks: 400 },
        { platform: "meta", campaignId: "123", campaignName: "Eid Sale", spend: 500_000, impressions: 5_000, clicks: 100 },
        { platform: "google", campaignId: "g1", campaignName: "Search", spend: 200_000, impressions: 1_000, clicks: 50 },
      ],
      [
        { utmSource: "facebook", utmCampaign: "eid sale", revenue: 2_000_000 },
        { utmSource: "facebook", utmCampaign: "123", revenue: 1_000_000 },
        { utmSource: "google", utmCampaign: "G1", revenue: 300_000 },
      ],
      map,
    );
    const eid = rows.find((r) => r.campaignName === "Eid Sale")!;
    expect(eid).toMatchObject({ spend: 1_000_000, impressions: 15_000, clicks: 500, orders: 2, revenue: 3_000_000, costPerOrder: 500_000 });
    expect(eid.roas).toBe(3);
    expect(rows.find((r) => r.platform === "google")).toMatchObject({ orders: 1, revenue: 300_000, roas: 1.5 });
  });

  it("puts paid orders without a matching campaign in an unmatched row and ignores organic orders", () => {
    const rows = computeRoas([], [
      { utmSource: "facebook", utmCampaign: "unknown", revenue: 100_000 },
      { utmSource: "facebook", utmCampaign: null, revenue: 50_000 },
      { utmSource: null, utmCampaign: null, revenue: 999_999 },
    ], map);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ platform: "meta", campaignName: UNMATCHED_CAMPAIGN, orders: 2, revenue: 150_000, roas: null, costPerOrder: null });
  });
});
