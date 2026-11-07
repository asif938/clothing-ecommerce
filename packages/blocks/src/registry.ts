import type { ComponentType } from "react";
import type { z } from "zod";
import type { LocalizedText } from "@clothing/shared";

/**
 * CMS block system (docs/PROJECT_SPEC.md §9.1). A page's `blocksDraft`/
 * `blocksPublished` column is `BlockInstance[]` — validated against the
 * matching `BlockDefinition.schema` on save, never trusted as-is from the
 * client (golden rule 6). An instance whose type isn't registered, or
 * whose props fail validation, is skipped at render time (logged, never a
 * crashed page) rather than rejected at read time — content authored
 * against an older block-type version must keep rendering.
 */
/**
 * Milestone 10 (§16 M10) — audience-targeted blocks. `mode: "all"` (the
 * default, omitted entirely on most blocks) skips the check completely —
 * only `"guest"`/`"customer"` and a non-empty `segmentIds` list opt a
 * block into client-side gating (`AudienceGate`, apps/storefront), since
 * segment membership and login state can't be known at the SSR-cached
 * layer without personalizing every page's cache key. See docs/DECISIONS.md.
 */
export interface BlockAudience {
  mode: "all" | "guest" | "customer";
  /** Customer must belong to at least one of these segments (ANDed with `mode: "customer"`, ignored for "all"/"guest"). */
  segmentIds?: string[];
}

export interface BlockVisibility {
  devices?: ("mobile" | "tablet" | "desktop")[];
  locales?: string[];
  audience?: BlockAudience;
}

export interface BlockSchedule {
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface BlockInstance<P = unknown> {
  id: string;
  type: string;
  props: P;
  visibility?: BlockVisibility;
  schedule?: BlockSchedule;
}

export interface BlockComponentProps<P> {
  props: P;
  locale: string;
}

export interface BlockDefinition<P = unknown> {
  type: string;
  label: LocalizedText;
  schema: z.ZodType<P>;
  defaults: P;
  component: ComponentType<BlockComponentProps<P>>;
  /** Custom HTML etc. — gated server-side when a page is saved, not just hidden in the UI. */
  superAdminOnly?: boolean;
}

const registry = new Map<string, BlockDefinition>();

export function registerBlock<P>(definition: BlockDefinition<P>): BlockDefinition<P> {
  registry.set(definition.type, definition as BlockDefinition);
  return definition;
}

export function getBlockDefinition(type: string): BlockDefinition | undefined {
  return registry.get(type);
}

export function listBlockDefinitions(): BlockDefinition[] {
  return [...registry.values()];
}

/** Schedule check only — locale/device visibility are handled by the renderer (locale: filter before render; device: CSS, see `deviceVisibilityClassName`). */
export function isBlockScheduledNow(instance: Pick<BlockInstance, "schedule">, now: Date = new Date()): boolean {
  const schedule = instance.schedule;
  if (!schedule) return true;
  if (schedule.startsAt && now < new Date(schedule.startsAt)) return false;
  if (schedule.endsAt && now > new Date(schedule.endsAt)) return false;
  return true;
}

export function isBlockVisibleForLocale(instance: Pick<BlockInstance, "visibility">, locale: string): boolean {
  const locales = instance.visibility?.locales;
  if (!locales || locales.length === 0) return true;
  return locales.includes(locale);
}

/** Whether a block needs `AudienceGate`'s client-side check at all — `"all"` (or no audience config) never does. */
export function needsAudienceGate(visibility: BlockVisibility | undefined): boolean {
  return visibility?.audience !== undefined && visibility.audience.mode !== "all";
}

/** Tailwind responsive-display classes so a device restriction doesn't need a server/client device sniff. */
export function deviceVisibilityClassName(visibility: BlockVisibility | undefined): string {
  const devices = visibility?.devices;
  if (!devices || devices.length === 0) return "";
  const show = { mobile: devices.includes("mobile"), tablet: devices.includes("tablet"), desktop: devices.includes("desktop") };
  const classes: string[] = [];
  classes.push(show.mobile ? "block" : "hidden");
  classes.push(show.tablet ? "sm:block" : "sm:hidden");
  classes.push(show.desktop ? "lg:block" : "lg:hidden");
  return classes.join(" ");
}
