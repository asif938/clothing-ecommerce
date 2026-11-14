/**
 * §8.2 "CSV/Excel import with column mapping". A spreadsheet's own headers are
 * mapped onto a fixed set of import fields — automatically (header aliases,
 * covering both the original M2 template and common merchant templates such as
 * `product_handle` / `variant_sku` / `price_bdt`), then adjustable by staff in
 * the admin import screen and saved as a reusable preset.
 */

export type FieldLevel = "product" | "variant";

interface FieldDefinition {
  key: string;
  level: FieldLevel;
  /** Normalized header spellings that auto-map to this field (see `normalizeHeader`). */
  aliases: string[];
}

const FIELD_DEFINITIONS = [
  { key: "sku", level: "variant", aliases: ["sku", "variantsku", "skucode"] },
  { key: "productSlug", level: "product", aliases: ["productslug", "producthandle", "handle", "slug", "productid"] },
  { key: "title", level: "product", aliases: ["title", "name", "productname", "producttitle"] },
  { key: "titleBn", level: "product", aliases: ["producttitlebn", "titlebn", "namebn", "productnamebn"] },
  { key: "titleEn", level: "product", aliases: ["producttitleen", "titleen", "nameen", "productnameen"] },
  { key: "categoryPath", level: "product", aliases: ["categorypath", "category", "categories", "productcategory"] },
  { key: "categorySlug", level: "product", aliases: ["categoryslug"] },
  { key: "status", level: "product", aliases: ["status", "productstatus"] },
  { key: "option1Name", level: "variant", aliases: ["option1name"] },
  { key: "option1Value", level: "variant", aliases: ["option1value", "option1"] },
  { key: "option2Name", level: "variant", aliases: ["option2name"] },
  { key: "option2Value", level: "variant", aliases: ["option2value", "option2"] },
  { key: "optionSize", level: "variant", aliases: ["optionsize", "size"] },
  { key: "optionColor", level: "variant", aliases: ["optioncolor", "optioncolour", "color", "colour"] },
  { key: "colorHex", level: "variant", aliases: ["colorhex", "colourhex", "hex", "swatchhex"] },
  { key: "barcode", level: "variant", aliases: ["barcode", "ean", "upc"] },
  { key: "price", level: "variant", aliases: ["price", "pricebdt", "pricetaka", "pricetk", "pricepoisha", "sellingprice"] },
  { key: "compareAtPrice", level: "variant", aliases: ["compareatprice", "compareatpricebdt", "compareatpricetaka", "compareatpricepoisha", "mrp", "regularprice", "oldprice"] },
  { key: "costPrice", level: "variant", aliases: ["costprice", "costpricebdt", "costpricetaka", "costpricepoisha", "cost"] },
  { key: "onHand", level: "variant", aliases: ["onhand", "stock", "stockqty", "stockquantity", "quantity", "qty", "inventory"] },
  { key: "weightGrams", level: "variant", aliases: ["weightgrams", "weight", "weightg", "weightingrams"] },
  { key: "sizeChart", level: "product", aliases: ["sizechart", "sizechartname"] },
  { key: "fabric", level: "product", aliases: ["fabric", "material"] },
  { key: "fit", level: "product", aliases: ["fit"] },
  { key: "occasion", level: "product", aliases: ["occasion", "occasions"] },
  { key: "tags", level: "product", aliases: ["tags", "tag", "keywords"] },
  { key: "description", level: "product", aliases: ["description", "body", "bodyhtml"] },
  { key: "descriptionBn", level: "product", aliases: ["descriptionbn"] },
  { key: "descriptionEn", level: "product", aliases: ["descriptionen"] },
  { key: "careInstructions", level: "product", aliases: ["careinstructions", "care"] },
  { key: "careInstructionsBn", level: "product", aliases: ["careinstructionsbn"] },
  { key: "careInstructionsEn", level: "product", aliases: ["careinstructionsen"] },
  { key: "modelInfo", level: "product", aliases: ["modelinfo"] },
  { key: "seoTitle", level: "product", aliases: ["seotitle", "metatitle"] },
  { key: "seoDescription", level: "product", aliases: ["seodescription", "metadescription"] },
  { key: "isFeatured", level: "product", aliases: ["isfeatured", "featured"] },
  { key: "images", level: "variant", aliases: ["images", "image", "imagefiles", "imageurls", "imageurl", "photos", "pictures"] },
] as const satisfies readonly FieldDefinition[];

export type ImportField = (typeof FIELD_DEFINITIONS)[number]["key"];
export const IMPORT_FIELDS: readonly ImportField[] = FIELD_DEFINITIONS.map((field) => field.key);
export const IMPORT_FIELD_LEVELS: Readonly<Record<ImportField, FieldLevel>> = Object.fromEntries(FIELD_DEFINITIONS.map((field) => [field.key, field.level])) as Record<ImportField, FieldLevel>;

/** `{ [sourceHeader]: importField | null }` — null means "ignore this column". */
export type ColumnMapping = Record<string, ImportField | null>;

export interface ImportOptions {
  /** Unit the spreadsheet's money columns are written in. Stored internally as poisha (golden rule 3). */
  priceUnit: "bdt" | "poisha";
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = { priceUnit: "poisha" };

const fieldSet = new Set<string>(IMPORT_FIELDS);
export function isImportField(value: unknown): value is ImportField {
  return typeof value === "string" && fieldSet.has(value);
}

/** Lower-cased, BOM/space/underscore/hyphen/dot-free form used for alias matching (`"Variant SKU"` == `variant_sku`). */
export function normalizeHeader(header: string): string {
  return header.replace(new RegExp("^\\uFEFF"), "").toLowerCase().replace(/[\s_\-.()]/g, "");
}

const aliasLookup = new Map<string, ImportField>();
for (const field of FIELD_DEFINITIONS) {
  for (const alias of field.aliases) aliasLookup.set(alias, field.key);
  aliasLookup.set(field.key.toLowerCase(), field.key);
}

/** Auto-maps each header to the field it most likely means; unknown headers map to null. A field is never assigned twice (first header wins). */
export function suggestMapping(headers: string[]): ColumnMapping {
  const used = new Set<ImportField>();
  const mapping: ColumnMapping = {};
  for (const header of headers) {
    const field = aliasLookup.get(normalizeHeader(header)) ?? null;
    if (field && !used.has(field)) {
      mapping[header] = field;
      used.add(field);
    } else {
      mapping[header] = null;
    }
  }
  return mapping;
}

const MONEY_FIELDS = new Set<ImportField>(["price", "compareAtPrice", "costPrice"]);

/** Taka unless a money header says poisha — `price_bdt`/`Price (Tk)` read as taka, the original M2 template's bare `price` as poisha. */
export function suggestOptions(mapping: ColumnMapping): ImportOptions {
  const moneyHeaders = Object.entries(mapping)
    .filter(([, field]) => field && MONEY_FIELDS.has(field))
    .map(([header]) => normalizeHeader(header));
  if (moneyHeaders.some((h) => /bdt|taka|tk/.test(h))) return { priceUnit: "bdt" };
  return { ...DEFAULT_IMPORT_OPTIONS };
}

/** Projects a raw sheet row onto import fields. Headers are matched exactly first, then by normalized form (so a saved preset survives a stray BOM or casing change). */
export function applyMapping(raw: Record<string, unknown>, mapping: ColumnMapping): Partial<Record<ImportField, unknown>> {
  const normalizedMapping = new Map<string, ImportField | null>();
  for (const [header, field] of Object.entries(mapping)) normalizedMapping.set(normalizeHeader(header), field);

  const result: Partial<Record<ImportField, unknown>> = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = header in mapping ? mapping[header] : normalizedMapping.get(normalizeHeader(header));
    if (field && result[field] === undefined) result[field] = value;
  }
  return result;
}

/** Validates an incoming mapping (from a request or a saved preset): drops unknown field names rather than trusting them. */
export function sanitizeMapping(input: unknown): ColumnMapping | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const mapping: ColumnMapping = {};
  for (const [header, field] of Object.entries(input as Record<string, unknown>)) {
    if (header.length > 200) continue;
    mapping[header] = isImportField(field) ? field : null;
  }
  // An empty mapping (or a stored Prisma JSON-null marker) means "none chosen" → auto-detect.
  return Object.keys(mapping).length > 0 ? mapping : null;
}

export function sanitizeOptions(input: unknown): ImportOptions {
  const priceUnit = input && typeof input === "object" && (input as { priceUnit?: unknown }).priceUnit;
  return { priceUnit: priceUnit === "bdt" || priceUnit === "poisha" ? priceUnit : DEFAULT_IMPORT_OPTIONS.priceUnit };
}
