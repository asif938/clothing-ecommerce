import { z } from "zod";

/**
 * Fixed CSV/Excel import template (docs/PROJECT_SPEC.md §8.2 "CSV/Excel
 * import with column mapping"): a full drag-and-drop column mapper is out
 * of scope for this milestone (see docs/DECISIONS.md) — one row is one
 * variant, grouped into a product by `productSlug`, which covers the
 * stated acceptance scenario ("import 500 products with variants from a
 * CSV in one job with an error report") without that extra UI. Column
 * names are case-insensitive and tolerant of spaces (`"Product Slug"` ==
 * `productSlug`), since that's how non-technical staff actually export a
 * spreadsheet.
 */
export const IMPORT_COLUMNS = [
  "sku",
  "productSlug",
  "productTitleEn",
  "productTitleBn",
  "categorySlug",
  "optionSize",
  "optionColor",
  "price",
  "compareAtPrice",
  "costPrice",
  "barcode",
  "weightGrams",
  "onHand",
  "status",
  "tags",
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

const normalizedColumnLookup = new Map(IMPORT_COLUMNS.map((column) => [column.toLowerCase().replace(/[\s_-]/g, ""), column]));

/** Maps a raw sheet row's arbitrary header casing/spacing onto the fixed template's column keys. */
export function normalizeRow(raw: Record<string, unknown>): Partial<Record<ImportColumn, unknown>> {
  const normalized: Partial<Record<ImportColumn, unknown>> = {};
  for (const [key, value] of Object.entries(raw)) {
    const column = normalizedColumnLookup.get(key.toLowerCase().replace(/[\s_-]/g, ""));
    if (column) normalized[column] = value;
  }
  return normalized;
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : NaN;
}

export const importRowSchema = z.object({
  sku: z.string().min(1, "sku is required"),
  productSlug: z.string().min(1, "productSlug is required"),
  productTitleEn: z.string().optional(),
  productTitleBn: z.string().optional(),
  categorySlug: z.string().optional(),
  optionSize: z.string().optional(),
  optionColor: z.string().optional(),
  price: z.number().int("price must be a whole number of poisha").min(0, "price must not be negative"),
  compareAtPrice: z.number().int().min(0).optional(),
  costPrice: z.number().int().min(0).optional(),
  barcode: z.string().optional(),
  weightGrams: z.number().int().min(0).optional(),
  onHand: z.number().int().min(0).optional(),
  status: z.enum(["draft", "active", "archived", "scheduled"]).optional(),
  tags: z.array(z.string()).optional(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export interface RowValidationError {
  row: number;
  sku: string | null;
  message: string;
}

/** Coerces a raw sheet row (arbitrary header casing, string numbers, comma-joined tags) and validates it. 1-based `rowNumber` is for error reporting, matching what a spreadsheet editor shows. */
export function validateImportRow(raw: Record<string, unknown>, rowNumber: number): { row: ImportRow; error: null } | { row: null; error: RowValidationError } {
  const normalized = normalizeRow(raw);
  const skuRaw = normalized.sku;
  const sku = typeof skuRaw === "string" ? skuRaw.trim() : skuRaw != null ? String(skuRaw) : null;

  const candidate = {
    sku: sku ?? "",
    productSlug: normalized.productSlug != null ? String(normalized.productSlug).trim() : "",
    productTitleEn: normalized.productTitleEn != null ? String(normalized.productTitleEn) : undefined,
    productTitleBn: normalized.productTitleBn != null ? String(normalized.productTitleBn) : undefined,
    categorySlug: normalized.categorySlug != null ? String(normalized.categorySlug).trim() : undefined,
    optionSize: normalized.optionSize != null ? String(normalized.optionSize).trim() : undefined,
    optionColor: normalized.optionColor != null ? String(normalized.optionColor).trim() : undefined,
    price: toNumber(normalized.price),
    compareAtPrice: toNumber(normalized.compareAtPrice),
    costPrice: toNumber(normalized.costPrice),
    barcode: normalized.barcode != null && normalized.barcode !== "" ? String(normalized.barcode).trim() : undefined,
    weightGrams: toNumber(normalized.weightGrams),
    onHand: toNumber(normalized.onHand),
    status: normalized.status != null ? String(normalized.status).trim() : undefined,
    tags:
      normalized.tags != null && String(normalized.tags).trim() !== ""
        ? String(normalized.tags)
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : undefined,
  };

  const result = importRowSchema.safeParse(candidate);
  if (!result.success) {
    return { row: null, error: { row: rowNumber, sku, message: result.error.issues.map((issue) => issue.message).join("; ") } };
  }
  return { row: result.data, error: null };
}
