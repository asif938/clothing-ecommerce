import { z } from "zod";
import { CONFIG_BUNDLE_SECTION_KEYS, CONFIG_BUNDLE_VERSION } from "@clothing/shared/analytics";

/**
 * Config bundle helpers (docs/PROJECT_SPEC.md §4 "Config export/import",
 * §16 M17). A bundle carries a brand's *configuration* — settings, UI
 * strings, message templates, categories, attributes, menus, CMS pages —
 * never orders, customers, stock or secrets. Pure functions so the
 * portability rules (ids → slugs, reference warnings, change detection) are
 * unit-tested; the service does the I/O.
 */

export const BUNDLE_FORMAT = "clothing-config-bundle";

const localized = z.object({ bn: z.string().optional(), en: z.string().optional() }).passthrough();

export const bundleSchema = z.object({
  format: z.literal(BUNDLE_FORMAT),
  version: z.number().int().min(1).max(CONFIG_BUNDLE_VERSION),
  exportedAt: z.string().optional(),
  sections: z.array(z.enum(CONFIG_BUNDLE_SECTION_KEYS)).default([]),
  data: z
    .object({
      settings: z.record(z.string(), z.unknown()).optional(),
      uiStrings: z.array(z.object({ key: z.string().min(1).max(200), bn: z.string(), en: z.string() })).optional(),
      messageTemplates: z
        .array(
          z.object({
            event: z.string().min(1),
            channel: z.string().min(1),
            isActive: z.boolean(),
            subjectBn: z.string().nullable(),
            subjectEn: z.string().nullable(),
            bodyBn: z.string(),
            bodyEn: z.string(),
          }),
        )
        .optional(),
      categories: z
        .array(
          z.object({
            slug: z.string().min(1),
            parentSlug: z.string().nullable(),
            name: localized,
            description: localized.nullable(),
            sortOrder: z.number().int(),
            isActive: z.boolean(),
            seoTitle: localized.nullable(),
            seoDescription: localized.nullable(),
          }),
        )
        .optional(),
      attributes: z
        .array(
          z.object({
            code: z.string().min(1),
            name: localized,
            type: z.string().min(1),
            isFilterable: z.boolean(),
            isVisibleOnPdp: z.boolean(),
            sortOrder: z.number().int(),
            values: z.array(z.object({ slug: z.string().min(1), value: localized, colorHex: z.string().nullable(), sortOrder: z.number().int() })),
          }),
        )
        .optional(),
      menus: z.array(z.object({ key: z.string().min(1), name: z.string(), items: z.array(z.unknown()) })).optional(),
      pages: z
        .array(
          z.object({
            slug: z.string().min(1),
            title: z.string(),
            status: z.string(),
            blocksDraft: z.unknown(),
            blocksPublished: z.unknown().nullable(),
            seoTitle: localized.nullable(),
            seoDescription: localized.nullable(),
            noindex: z.boolean(),
            isSystem: z.boolean(),
            needsContent: z.boolean(),
          }),
        )
        .optional(),
    })
    .default({}),
});
export type ConfigBundle = z.infer<typeof bundleSchema>;

// ---------------------------------------------------------------------------
// Menus — items point at categories / collections / products / pages by id,
// which differ per deployment. A bundle stores the slug instead.
// ---------------------------------------------------------------------------

export interface MenuItem {
  id?: string;
  label?: unknown;
  type?: string;
  targetId?: string | null;
  targetSlug?: string | null;
  url?: string | null;
  children?: MenuItem[];
  [key: string]: unknown;
}

const SLUG_TARGET_TYPES = new Set(["category", "collection", "product", "page"]);

export type SlugLookup = Record<"category" | "collection" | "product" | "page", Map<string, string>>;

/** Export direction: swaps each `targetId` for the target's slug (`id → slug` maps per type). */
export function menuItemsToPortable(items: MenuItem[], slugById: SlugLookup): MenuItem[] {
  return items.map((item) => {
    const { targetId, children, ...rest } = item;
    const out: MenuItem = { ...rest };
    if (item.type && SLUG_TARGET_TYPES.has(item.type) && targetId) {
      const slug = slugById[item.type as keyof SlugLookup].get(targetId);
      out.targetSlug = slug ?? null;
    }
    if (children) out.children = menuItemsToPortable(children, slugById);
    return out;
  });
}

/**
 * Import direction: resolves slugs to this deployment's ids (`slug → id` maps
 * per type). Items whose target does not exist here are kept but get no
 * `targetId`, and are counted so the importer can warn — a menu with a dead
 * link is visible and fixable; silently dropping it is not.
 */
export function menuItemsFromPortable(items: MenuItem[], idBySlug: SlugLookup): { items: MenuItem[]; unresolved: string[] } {
  const unresolved: string[] = [];
  const walk = (list: MenuItem[]): MenuItem[] =>
    list.map((item) => {
      const { targetSlug, children, ...rest } = item;
      const out: MenuItem = { ...rest };
      if (item.type && SLUG_TARGET_TYPES.has(item.type) && targetSlug) {
        const id = idBySlug[item.type as keyof SlugLookup].get(targetSlug);
        if (id) out.targetId = id;
        else unresolved.push(`${item.type}:${targetSlug}`);
      }
      if (children) out.children = walk(children);
      return out;
    });
  return { items: walk(items), unresolved };
}

// ---------------------------------------------------------------------------
// Page blocks — free-form JSON that may embed ids from the source database.
// ---------------------------------------------------------------------------

const REFERENCE_KEY = /^(media|image|product|collection|category|page|banner)(Id|Ids)$|MediaId$/i;

/** Distinct block field names that hold ids from the exporting deployment and will not resolve on import. */
export function findIdReferences(blocks: unknown): string[] {
  const found = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (REFERENCE_KEY.test(key) && child !== null && child !== "" && !(Array.isArray(child) && child.length === 0)) found.add(key);
        visit(child);
      }
    }
  };
  visit(blocks);
  return [...found].sort();
}

// ---------------------------------------------------------------------------
// Change detection
// ---------------------------------------------------------------------------

/** JSON with object keys sorted, so two structurally equal values compare equal regardless of key order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sameValue(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

export interface SectionPlan {
  created: number;
  updated: number;
  unchanged: number;
  /** Rows that could not be applied, with the reason. */
  skipped: { id: string; reason: string }[];
  warnings: string[];
}

export const emptyPlan = (): SectionPlan => ({ created: 0, updated: 0, unchanged: 0, skipped: [], warnings: [] });

/** Orders categories so every parent comes before its children; categories whose parent is missing are returned separately. */
export function orderByParent<T extends { slug: string; parentSlug: string | null }>(categories: T[], existingSlugs: Set<string>): { ordered: T[]; orphans: T[] } {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const ordered: T[] = [];
  const placed = new Set<string>();
  const orphans: T[] = [];
  const visiting = new Set<string>();
  const place = (category: T): boolean => {
    if (placed.has(category.slug)) return true;
    if (visiting.has(category.slug)) return false; // cycle
    visiting.add(category.slug);
    let ok = true;
    if (category.parentSlug) {
      const parent = bySlug.get(category.parentSlug);
      if (parent) ok = place(parent);
      else ok = existingSlugs.has(category.parentSlug);
    }
    visiting.delete(category.slug);
    if (!ok) return false;
    placed.add(category.slug);
    ordered.push(category);
    return true;
  };
  for (const category of categories) if (!place(category)) orphans.push(category);
  return { ordered, orphans };
}
