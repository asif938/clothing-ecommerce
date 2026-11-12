/**
 * Product quality checker (docs/PROJECT_SPEC.md §8.2 Catalog "Product
 * quality checker (phase 2): missing images/description/size
 * chart/translation/SEO/weight", §16 M13). Pure: the API loads the
 * product facts, this decides what's missing and how much it matters.
 */

export interface LocalizedValue {
  bn?: string | null;
  en?: string | null;
}

export interface ProductQualityInput {
  title: LocalizedValue | null;
  description: LocalizedValue | null;
  seoTitle: LocalizedValue | null;
  seoDescription: LocalizedValue | null;
  categoryId: string | null;
  imageCount: number;
  imagesMissingAlt: number;
  /** True when the product has a size-type option (needs a size chart). */
  hasSizeOption: boolean;
  /** A size chart on the product or inherited from its category. */
  hasSizeChart: boolean;
  weightGramsDefault: number | null;
  variants: { price: number; compareAtPrice: number | null; weightGrams: number | null; costPrice: number | null }[];
}

export const QUALITY_ISSUES = {
  missing_images: 25,
  few_images: 5,
  missing_description_bn: 10,
  missing_description_en: 10,
  missing_title_bn: 10,
  missing_title_en: 10,
  missing_seo_title: 5,
  missing_seo_description: 5,
  missing_size_chart: 10,
  missing_weight: 5,
  missing_alt_text: 5,
  missing_category: 10,
  compare_at_not_higher: 5,
  missing_cost: 3,
} as const;
export type QualityIssue = keyof typeof QUALITY_ISSUES;

export interface ProductQualityResult {
  score: number;
  issues: QualityIssue[];
}

const MIN_DESCRIPTION_CHARS = 40;

function has(value: string | null | undefined, min = 1): boolean {
  return typeof value === "string" && stripHtml(value).trim().length >= min;
}

export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
}

export function checkProductQuality(input: ProductQualityInput): ProductQualityResult {
  const issues: QualityIssue[] = [];
  if (input.imageCount === 0) issues.push("missing_images");
  else if (input.imageCount < 2) issues.push("few_images");
  if (!has(input.title?.bn)) issues.push("missing_title_bn");
  if (!has(input.title?.en)) issues.push("missing_title_en");
  if (!has(input.description?.bn, MIN_DESCRIPTION_CHARS)) issues.push("missing_description_bn");
  if (!has(input.description?.en, MIN_DESCRIPTION_CHARS)) issues.push("missing_description_en");
  if (!has(input.seoTitle?.bn) && !has(input.seoTitle?.en)) issues.push("missing_seo_title");
  if (!has(input.seoDescription?.bn) && !has(input.seoDescription?.en)) issues.push("missing_seo_description");
  if (input.hasSizeOption && !input.hasSizeChart) issues.push("missing_size_chart");
  if (input.weightGramsDefault === null && input.variants.some((v) => v.weightGrams === null)) issues.push("missing_weight");
  if (input.imagesMissingAlt > 0) issues.push("missing_alt_text");
  if (!input.categoryId) issues.push("missing_category");
  if (input.variants.some((v) => v.compareAtPrice !== null && v.compareAtPrice <= v.price)) issues.push("compare_at_not_higher");
  if (input.variants.some((v) => v.costPrice === null)) issues.push("missing_cost");

  const penalty = issues.reduce((sum, issue) => sum + QUALITY_ISSUES[issue], 0);
  return { score: Math.max(0, 100 - penalty), issues };
}
