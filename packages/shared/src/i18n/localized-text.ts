import { z } from "zod";

/** The two locales this platform ships (docs/PROJECT_SPEC.md §4.5). */
export const LOCALES = ["bn", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "bn";

/**
 * Every customer-facing text field is stored as this JSONB shape (golden
 * rule 4 / §4.5), never as a single hardcoded string.
 */
export type LocalizedText = Partial<Record<Locale, string>>;

export const localizedTextSchema: z.ZodType<LocalizedText> = z
  .object({ bn: z.string().optional(), en: z.string().optional() })
  .partial();

/**
 * Resolve a LocalizedText field for display: requested locale, then the
 * platform default locale, then whatever value exists, then "".
 */
export function t(field: LocalizedText | null | undefined, locale: Locale, defaultLocale: Locale = DEFAULT_LOCALE): string {
  if (!field) return "";
  if (field[locale]) return field[locale]!;
  if (field[defaultLocale]) return field[defaultLocale]!;
  const firstAvailable = LOCALES.map((l) => field[l]).find((v) => !!v);
  return firstAvailable ?? "";
}

export function isLocalizedTextEmpty(field: LocalizedText | null | undefined): boolean {
  if (!field) return true;
  return LOCALES.every((l) => !field[l]);
}
