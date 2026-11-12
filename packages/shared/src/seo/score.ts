import { stripHtml, type LocalizedValue } from "../catalog/quality.ts";

/**
 * SEO score (docs/PROJECT_SPEC.md §9.5 SEO controls, §13.2, §16 M13 "SEO
 * score"). A transparent checklist, not a black box: each failed check
 * costs fixed points and is reported by code so the admin can show what to
 * fix. Checked for both locales the storefront serves (bn default, en).
 */

export interface SeoInput {
  title: LocalizedValue | null;
  seoTitle: LocalizedValue | null;
  seoDescription: LocalizedValue | null;
  slug: string;
  /** Main body/description text (HTML allowed) per locale. */
  body: LocalizedValue | null;
  /** Minimum body length worth indexing for this kind of page (e.g. 150 for products, 300 for articles). */
  minBodyChars: number;
  imageCount: number;
  imagesWithAlt: number;
  noindex?: boolean;
}

export const SEO_CHECKS = {
  title_missing: 20,
  title_too_short: 5,
  title_too_long: 5,
  description_missing: 15,
  description_too_short: 5,
  description_too_long: 5,
  slug_not_clean: 10,
  slug_too_long: 5,
  thin_content: 10,
  images_missing_alt: 5,
  noindex: 30,
} as const;
export type SeoCheck = keyof typeof SEO_CHECKS;

export interface SeoIssue {
  check: SeoCheck;
  locale: "bn" | "en" | null;
}

export interface SeoResult {
  score: number;
  issues: SeoIssue[];
}

export const SEO_TITLE_RANGE = { min: 20, max: 60 } as const;
export const SEO_DESCRIPTION_RANGE = { min: 70, max: 160 } as const;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function text(value: string | null | undefined): string {
  return value ? stripHtml(value).trim() : "";
}

export function scoreSeo(input: SeoInput): SeoResult {
  const issues: SeoIssue[] = [];
  for (const locale of ["bn", "en"] as const) {
    // The page title falls back to the plain title when no SEO title is set (that's what the storefront renders).
    const title = text(input.seoTitle?.[locale]) || text(input.title?.[locale]);
    if (!title) issues.push({ check: "title_missing", locale });
    else if (title.length < SEO_TITLE_RANGE.min) issues.push({ check: "title_too_short", locale });
    else if (title.length > SEO_TITLE_RANGE.max) issues.push({ check: "title_too_long", locale });

    const description = text(input.seoDescription?.[locale]);
    if (!description) issues.push({ check: "description_missing", locale });
    else if (description.length < SEO_DESCRIPTION_RANGE.min) issues.push({ check: "description_too_short", locale });
    else if (description.length > SEO_DESCRIPTION_RANGE.max) issues.push({ check: "description_too_long", locale });

    if (text(input.body?.[locale]).length < input.minBodyChars) issues.push({ check: "thin_content", locale });
  }
  if (!SLUG_PATTERN.test(input.slug)) issues.push({ check: "slug_not_clean", locale: null });
  if (input.slug.length > 75) issues.push({ check: "slug_too_long", locale: null });
  if (input.imageCount > input.imagesWithAlt) issues.push({ check: "images_missing_alt", locale: null });
  if (input.noindex) issues.push({ check: "noindex", locale: null });

  // Per-locale checks cost half each so a page missing one language loses the same as one missing a shared check.
  const penalty = issues.reduce((sum, issue) => sum + (issue.locale ? SEO_CHECKS[issue.check] / 2 : SEO_CHECKS[issue.check]), 0);
  return { score: Math.max(0, Math.round(100 - penalty)), issues };
}
