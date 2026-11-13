"use client";

import type { ProductCard } from "./store-api";

/**
 * Client calls for §16 M14 — recommendations, visual search and A/B test
 * assignments. All go through the same-origin `/api` rewrite so the API's
 * httpOnly `anonymous_id` cookie (the visitor id for A/B tests) round-trips.
 * Every helper fails soft: personalization must never break a page.
 */

const RECENTLY_VIEWED_KEY = "recently-viewed";

export function readRecentlyViewed(max = 20): string[] {
  try {
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string").slice(0, max) : [];
  } catch {
    return [];
  }
}

export async function fetchForYou(limit: number): Promise<{ products: ProductCard[]; personalized: boolean }> {
  const viewed = readRecentlyViewed();
  const query = new URLSearchParams({ limit: String(limit) });
  if (viewed.length > 0) query.set("viewed", viewed.join(","));
  try {
    const res = await fetch(`/api/v1/store/recommendations/for-you?${query.toString()}`, { credentials: "same-origin", cache: "no-store" });
    return res.ok ? ((await res.json()) as { products: ProductCard[]; personalized: boolean }) : { products: [], personalized: false };
  } catch {
    return { products: [], personalized: false };
  }
}

export async function fetchCartRecommendations(productIds: string[]): Promise<ProductCard[]> {
  if (productIds.length === 0) return [];
  try {
    const res = await fetch(`/api/v1/store/recommendations/cart?productIds=${productIds.map(encodeURIComponent).join(",")}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as ProductCard[]) : [];
  } catch {
    return [];
  }
}

export interface VisualSearchResponse {
  products: (ProductCard & { score: number })[];
  tags: { garment: string; colors: string[]; pattern?: string } | null;
  indexedProducts: number;
}

export class VisualSearchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function visualSearch(file: File): Promise<VisualSearchResponse> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/v1/store/visual-search", { method: "POST", body, credentials: "same-origin" });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new VisualSearchError(data?.message ?? "Search failed", res.status);
  }
  return (await res.json()) as VisualSearchResponse;
}

// ---------------------------------------------------------------------------
// A/B tests
// ---------------------------------------------------------------------------

export interface ExperimentAssignment {
  experimentId: string;
  kind: "block" | "announcement" | "offer";
  variantKey: string;
  payload: unknown;
}

let assignmentsPromise: Promise<ExperimentAssignment[]> | null = null;

/** One request per page load, shared by every experiment on the page. */
export function getAssignments(): Promise<ExperimentAssignment[]> {
  assignmentsPromise ??= fetch("/api/v1/store/experiments/me", { credentials: "same-origin", cache: "no-store" })
    .then((res) => (res.ok ? (res.json() as Promise<{ assignments: ExperimentAssignment[] }>) : { assignments: [] }))
    .then((data) => data.assignments)
    .catch(() => []);
  return assignmentsPromise;
}

const pendingExposures = new Set<string>();
const sentExposures = new Set<string>();
let exposureTimer: ReturnType<typeof setTimeout> | null = null;

/** Batches exposures from every experiment that rendered on this page into one request. The server recomputes the variant. */
export function reportExposure(experimentId: string): void {
  if (sentExposures.has(experimentId)) return;
  sentExposures.add(experimentId);
  pendingExposures.add(experimentId);
  if (exposureTimer) return;
  exposureTimer = setTimeout(() => {
    const ids = [...pendingExposures];
    pendingExposures.clear();
    exposureTimer = null;
    void fetch("/api/v1/store/experiments/exposures", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentIds: ids }),
      keepalive: true,
    }).catch(() => undefined);
  }, 300);
}

export function reportClick(experimentId: string): void {
  void fetch("/api/v1/store/experiments/click", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ experimentId }),
    keepalive: true,
  }).catch(() => undefined);
}
