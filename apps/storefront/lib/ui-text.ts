import { UI_STRING_DEFAULTS } from "@clothing/shared";

type Locale = "bn" | "en";
type StringMap = Record<string, { bn?: string; en?: string }>;

const defaults: StringMap = Object.fromEntries(UI_STRING_DEFAULTS.map((entry) => [entry.key, { bn: entry.bn, en: entry.en }]));

/**
 * Resolves a UI-string key for the current locale: the admin-edited value from
 * the database first, then the seeded default (developer fallback — golden
 * rule 1 allows defaults in code), then the other language, then the key itself
 * so a missing string is visible rather than blank.
 */
export function uiText(strings: StringMap, locale: string): (key: string) => string {
  const lang: Locale = locale === "en" ? "en" : "bn";
  const other: Locale = lang === "bn" ? "en" : "bn";
  return (key) => strings[key]?.[lang] || defaults[key]?.[lang] || strings[key]?.[other] || defaults[key]?.[other] || key;
}
