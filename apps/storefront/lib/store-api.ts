import "server-only";

/**
 * Server-only fetches against the real API (`API_URL`, infra-only env,
 * docs/PROJECT_SPEC.md §4.1) tagged for Next's cache, so the publishing
 * pipeline (§9.6) can invalidate exactly what changed via
 * `app/api/revalidate/route.ts`'s `revalidateTag` — the mechanism behind
 * "a brand color / header variant / hero text change reaches the live
 * site within 10s without a deploy" (M3 acceptance scenario). Every
 * helper also falls back to a 60s revalidate window on its own, so a
 * missed/failed revalidation call still self-heals shortly.
 */

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function storeGet<T>(path: string, tags: string[]): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}/api/v1${path}`, { next: { revalidate: 60, tags } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export interface PublicConfig {
  [key: string]: unknown;
}

export async function getStoreConfig(): Promise<PublicConfig> {
  return (await storeGet<PublicConfig>("/store/config", ["settings"])) ?? {};
}

export interface BlockInstance {
  id: string;
  type: string;
  props: Record<string, unknown>;
  visibility?: { devices?: ("mobile" | "tablet" | "desktop")[]; locales?: string[] };
  schedule?: { startsAt?: string | null; endsAt?: string | null };
}

export interface PageData {
  id: string;
  slug: string;
  title: string;
  blocksPublished: BlockInstance[];
  seoTitle: { bn?: string; en?: string } | null;
  seoDescription: { bn?: string; en?: string } | null;
  noindex: boolean;
}

export async function getPage(slug: string): Promise<PageData | null> {
  return await storeGet<PageData>(`/store/pages/${slug}`, [`page:${slug}`, "pages"]);
}

export interface MenuItem {
  id: string;
  label: { bn?: string; en?: string };
  type: "category" | "collection" | "product" | "page" | "url";
  targetId?: string;
  url?: string;
  children?: MenuItem[];
}

export interface MenuData {
  key: string;
  name: string;
  items: MenuItem[];
}

export async function getMenu(key: string): Promise<MenuData | null> {
  return await storeGet<MenuData>(`/store/menus/${key}`, [`menu:${key}`, "menus"]);
}

export interface AnnouncementBar {
  id: string;
  message: { bn?: string; en?: string };
  linkUrl: string | null;
  linkText: { bn?: string; en?: string } | null;
}

export async function getAnnouncements(): Promise<AnnouncementBar[]> {
  return (await storeGet<AnnouncementBar[]>("/store/announcements", ["announcements"])) ?? [];
}

export interface PopupData {
  id: string;
  title: { bn?: string; en?: string };
  body: { bn?: string; en?: string };
  ctaText: { bn?: string; en?: string } | null;
  ctaUrl: string | null;
  trigger: "immediate" | "delay" | "exit_intent";
  delaySeconds: number | null;
}

export async function getPopups(): Promise<PopupData[]> {
  return (await storeGet<PopupData[]>("/store/popups", ["popups"])) ?? [];
}

export interface RedirectData {
  found?: false;
  toPath?: string;
  statusCode?: number;
}

/** §9.5 "auto-redirect on slug change" — checked by `pages/[slug]` once no CMS page matches, before giving up to a 404. */
export async function getRedirect(path: string): Promise<RedirectData | null> {
  const result = await storeGet<RedirectData>(`/store/redirects/lookup?path=${encodeURIComponent(path)}`, ["redirects"]);
  return result && result.toPath ? result : null;
}
