"use client";

/**
 * Campaign attribution (docs/PROJECT_SPEC.md §5.6 orders "source attribution",
 * §13.3, §16 M13 ROAS). The landing page's `utm_*` tags are kept for the
 * browser session (sessionStorage, so a new visit from another campaign
 * replaces them) and sent with the order. Storage failures (private mode)
 * just mean no attribution — never an error.
 */

const KEY = "utm";
const FIELDS = ["source", "medium", "campaign", "content"] as const;
export type Utm = Partial<Record<(typeof FIELDS)[number], string>>;

export function captureUtm(search: string): void {
  try {
    const params = new URLSearchParams(search);
    const utm: Utm = {};
    for (const field of FIELDS) {
      const value = params.get(`utm_${field}`)?.trim();
      if (value) utm[field] = value.slice(0, 200);
    }
    if (Object.keys(utm).length > 0) sessionStorage.setItem(KEY, JSON.stringify(utm));
  } catch {
    /* storage unavailable */
  }
}

export function readUtm(): { utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string } {
  try {
    const utm = JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Utm;
    return { utmSource: utm.source?.slice(0, 100), utmMedium: utm.medium?.slice(0, 100), utmCampaign: utm.campaign, utmContent: utm.content };
  } catch {
    return {};
  }
}
