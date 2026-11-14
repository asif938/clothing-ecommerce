import { applyMapping, suggestMapping, suggestOptions, type ColumnMapping, type ImportField, type ImportOptions } from "./mapping";

/**
 * One spreadsheet row = one variant, grouped into a product by `productSlug`
 * (docs/PROJECT_SPEC.md §8.2). Headers reach this file already projected onto
 * import fields by `mapping.ts` — either a staff-chosen column mapping or the
 * auto-suggested one, so the original fixed M2 template keeps working as-is.
 *
 * Product-level cells (title, category, description …) only need to appear on
 * one row of a product (typically its first); blank cells on the product's
 * other rows never overwrite them. The same goes for option names: a template
 * that writes `option1_name = Size` once and only `option1_value` afterwards
 * is resolved against the product's existing option at that position.
 */

export interface LocalizedInput {
  bn?: string;
  en?: string;
}

export interface ImportOptionInput {
  /** 0-based option slot (option1 → 0, option2 → 1). */
  position: number;
  /** Absent on continuation rows — resolved from the product's existing option at `position`. */
  name?: string;
  value: string;
}

export interface ImportRow {
  sku: string;
  productSlug: string;
  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  barcode?: string;
  weightGrams?: number;
  onHand?: number;
  options: ImportOptionInput[];
  /**
   * The row's swatch colour. Applied at import time to whichever option resolves to the colour
   * type — on continuation rows the option names are blank, so it can't be decided here.
   */
  colorHex?: string;
  title?: LocalizedInput;
  categoryPath?: string[];
  categorySlug?: string;
  status?: "draft" | "active" | "archived" | "scheduled";
  tags?: string[];
  description?: LocalizedInput;
  careInstructions?: LocalizedInput;
  fabric?: LocalizedInput;
  modelInfo?: LocalizedInput;
  seoTitle?: LocalizedInput;
  seoDescription?: LocalizedInput;
  isFeatured?: boolean;
  sizeChart?: string;
  fit?: string;
  occasion?: string[];
  /** File names (matched against the uploaded ZIP) or https URLs. */
  images?: string[];
}

export interface RowValidationError {
  row: number;
  sku: string | null;
  message: string;
  /** Warnings are reported but never fail the row (e.g. a missing size chart or image). */
  level?: "error" | "warning";
}

const BANGLA_SCRIPT = /[ঀ-৿]/;
const BANGLA_DIGITS = /[০-৯]/g;
const STATUSES = new Set(["draft", "active", "archived", "scheduled"]);
const HEX_COLOR = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;
const MAX_CATEGORY_DEPTH = 5;

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const result = String(value).trim();
  return result === "" ? undefined : result;
}

function westernDigits(value: string): string {
  return value.replace(BANGLA_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x09e6));
}

/** Parses a number cell — tolerant of thousands separators, Bangla digits, and currency marks (`৳2,450`, `Tk 2450`). NaN for non-numeric text. */
function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return value;
  const cleaned = westernDigits(String(value))
    .replace(/৳|tk\.?|bdt|taka|,|\s/gi, "")
    .trim();
  if (cleaned === "") return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** Splits a multi-value cell (`eid-2027;new-arrival`, `Eid, Festive`, `a|b`). */
export function splitList(value: unknown, separators: RegExp = /[;,|]/): string[] | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const parts = raw
    .split(separators)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

/** A single-language cell goes to `bn` when it contains Bangla script, else `en`. Explicit `…Bn`/`…En` columns win over the auto one. */
export function localize(auto: unknown, bn?: unknown, en?: unknown): LocalizedInput | undefined {
  const result: LocalizedInput = {};
  const autoText = text(auto);
  if (autoText) result[BANGLA_SCRIPT.test(autoText) ? "bn" : "en"] = autoText;
  const bnText = text(bn);
  const enText = text(en);
  if (bnText) result.bn = bnText;
  if (enText) result.en = enText;
  return result.bn || result.en ? result : undefined;
}

export function parseBoolean(value: unknown): boolean | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1", "হ্যাঁ"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "না"].includes(normalized)) return false;
  return null;
}

/** `Men > Panjabi` → `["Men", "Panjabi"]`. */
export function parseCategoryPath(value: unknown): string[] | undefined {
  return splitList(value, />/);
}

/** Option-name heuristics shared with the importer: which option type a column like `Waist` or `Colour` represents. */
export function optionTypeForName(name: string): "size" | "color" | "generic" {
  const normalized = name.trim().toLowerCase();
  if (/^(colou?r|shade|রং|রঙ)$/.test(normalized)) return "color";
  if (/^(size|waist|age|length|chest|inseam|সাইজ|মাপ)$/.test(normalized)) return "size";
  return "generic";
}

export function validateImportRow(
  raw: Record<string, unknown>,
  rowNumber: number,
  mapping?: ColumnMapping | null,
  options?: ImportOptions,
): { row: ImportRow; error: null; warnings: string[] } | { row: null; error: RowValidationError; warnings: string[] } {
  const effectiveMapping = mapping ?? suggestMapping(Object.keys(raw));
  const effectiveOptions = options ?? suggestOptions(effectiveMapping);
  const cells = applyMapping(raw, effectiveMapping);
  const get = (field: ImportField) => cells[field];

  const errors: string[] = [];
  const warnings: string[] = [];
  const sku = text(get("sku")) ?? null;
  const productSlug = text(get("productSlug"));
  if (!sku) errors.push("sku is required");
  if (!productSlug) errors.push("productSlug is required");

  const money = (field: ImportField, label: string, required: boolean): number | undefined => {
    const value = parseNumber(get(field));
    if (value === undefined) {
      if (required) errors.push(`${label} is required`);
      return undefined;
    }
    if (Number.isNaN(value)) {
      errors.push(`${label} must be a number`);
      return undefined;
    }
    if (value < 0) {
      errors.push(`${label} must not be negative`);
      return undefined;
    }
    if (effectiveOptions.priceUnit === "bdt") return Math.round(value * 100);
    if (!Number.isInteger(value)) {
      errors.push(`${label} must be a whole number of poisha`);
      return undefined;
    }
    return value;
  };
  const wholeNumber = (field: ImportField, label: string): number | undefined => {
    const value = parseNumber(get(field));
    if (value === undefined) return undefined;
    if (Number.isNaN(value) || !Number.isInteger(value) || value < 0) {
      errors.push(`${label} must be a whole number, 0 or more`);
      return undefined;
    }
    return value;
  };

  const price = money("price", "price", true);
  const compareAtPrice = money("compareAtPrice", "compareAtPrice", false);
  const costPrice = money("costPrice", "costPrice", false);
  const onHand = wholeNumber("onHand", "onHand");
  const weightGrams = wholeNumber("weightGrams", "weightGrams");

  const statusText = text(get("status"))?.toLowerCase();
  if (statusText && !STATUSES.has(statusText)) errors.push(`status must be one of draft, active, archived, scheduled (got "${statusText}")`);

  const isFeatured = parseBoolean(get("isFeatured"));
  if (isFeatured === null) errors.push(`isFeatured must be TRUE or FALSE`);

  // Options: generic option1/option2 slots, plus the original template's fixed size/color columns.
  const optionInputs: ImportOptionInput[] = [];
  let colorHex = text(get("colorHex"));
  if (colorHex && !HEX_COLOR.test(colorHex)) {
    warnings.push(`colorHex "${colorHex}" is not a hex colour — ignored`);
    colorHex = undefined;
  }
  const normalizedHex = colorHex ? (colorHex.startsWith("#") ? colorHex : `#${colorHex}`).toUpperCase() : undefined;
  for (const [position, nameField, valueField] of [
    [0, "option1Name", "option1Value"],
    [1, "option2Name", "option2Value"],
  ] as const) {
    const value = text(get(valueField));
    if (!value) continue;
    const name = text(get(nameField));
    optionInputs.push({ position, name, value });
  }
  const size = text(get("optionSize"));
  if (size) optionInputs.push({ position: optionInputs.length, name: "Size", value: size });
  const color = text(get("optionColor"));
  if (color) optionInputs.push({ position: optionInputs.length, name: "Color", value: color });

  const categoryPath = parseCategoryPath(get("categoryPath"));
  if (categoryPath && categoryPath.length > MAX_CATEGORY_DEPTH) errors.push(`categoryPath is deeper than ${MAX_CATEGORY_DEPTH} levels`);

  if (errors.length > 0) {
    return { row: null, error: { row: rowNumber, sku, message: errors.join("; "), level: "error" }, warnings };
  }

  const row: ImportRow = {
    sku: sku!,
    productSlug: productSlug!,
    price: price!,
    compareAtPrice,
    costPrice,
    barcode: text(get("barcode")),
    weightGrams,
    onHand,
    options: optionInputs,
    colorHex: normalizedHex,
    title: localize(get("title"), get("titleBn"), get("titleEn")),
    categoryPath,
    categorySlug: text(get("categorySlug")),
    status: statusText as ImportRow["status"],
    tags: splitList(get("tags")),
    description: localize(get("description"), get("descriptionBn"), get("descriptionEn")),
    careInstructions: localize(get("careInstructions"), get("careInstructionsBn"), get("careInstructionsEn")),
    fabric: localize(get("fabric")),
    modelInfo: localize(get("modelInfo")),
    seoTitle: localize(get("seoTitle")),
    seoDescription: localize(get("seoDescription")),
    isFeatured: isFeatured ?? undefined,
    sizeChart: text(get("sizeChart")),
    fit: text(get("fit")),
    occasion: splitList(get("occasion")),
    images: splitList(get("images"), /[;,|\n]/),
  };
  return { row, error: null, warnings };
}
