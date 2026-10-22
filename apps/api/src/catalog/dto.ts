import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared/i18n";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const createCategorySchema = z.object({
  name: localizedTextSchema,
  slug: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
  description: localizedTextSchema.optional(),
  imageMediaId: z.string().nullable().optional(),
  bannerMediaId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  seoTitle: localizedTextSchema.optional(),
  seoDescription: localizedTextSchema.optional(),
  sizeChartId: z.string().nullable().optional(),
  attributeIds: z.array(z.string()).optional(),
});
export type CreateCategoryDto = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;

// ---------------------------------------------------------------------------
// Attributes & values
// ---------------------------------------------------------------------------

export const attributeTypeSchema = z.enum(["select", "multiselect", "text", "number", "boolean", "color"]);

export const createAttributeSchema = z.object({
  code: z.string().min(1),
  name: localizedTextSchema,
  type: attributeTypeSchema,
  isFilterable: z.boolean().optional(),
  isVisibleOnPdp: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type CreateAttributeDto = z.infer<typeof createAttributeSchema>;

export const updateAttributeSchema = createAttributeSchema.partial().omit({ code: true });
export type UpdateAttributeDto = z.infer<typeof updateAttributeSchema>;

export const createAttributeValueSchema = z.object({
  value: localizedTextSchema,
  slug: z.string().min(1).optional(),
  colorHex: z.string().nullable().optional(),
  imageMediaId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});
export type CreateAttributeValueDto = z.infer<typeof createAttributeValueSchema>;

export const updateAttributeValueSchema = createAttributeValueSchema.partial();
export type UpdateAttributeValueDto = z.infer<typeof updateAttributeValueSchema>;

// ---------------------------------------------------------------------------
// Size systems
// ---------------------------------------------------------------------------

export const sizeSystemTypeSchema = z.enum(["letter", "numeric", "kids_age", "free_size", "custom"]);

const sizeSystemValueSchema = z.object({ code: z.string().min(1), label: localizedTextSchema });

export const createSizeSystemSchema = z.object({
  name: localizedTextSchema,
  type: sizeSystemTypeSchema,
  values: z.array(sizeSystemValueSchema),
});
export type CreateSizeSystemDto = z.infer<typeof createSizeSystemSchema>;

export const updateSizeSystemSchema = createSizeSystemSchema.partial();
export type UpdateSizeSystemDto = z.infer<typeof updateSizeSystemSchema>;

// ---------------------------------------------------------------------------
// Size charts
// ---------------------------------------------------------------------------

const sizeChartColumnSchema = z.object({ key: z.string().min(1), label: localizedTextSchema });
const sizeChartRowSchema = z.object({ size: z.string().min(1), measurements: z.record(z.string(), z.number()) });

export const createSizeChartSchema = z.object({
  name: localizedTextSchema,
  unitDefault: z.enum(["inch", "cm"]).optional(),
  columns: z.array(sizeChartColumnSchema),
  rows: z.array(sizeChartRowSchema),
  howToMeasure: z.object({ content: localizedTextSchema.optional(), imageMediaId: z.string().nullable().optional() }).nullable().optional(),
  notes: localizedTextSchema.optional(),
});
export type CreateSizeChartDto = z.infer<typeof createSizeChartSchema>;

export const updateSizeChartSchema = createSizeChartSchema.partial();
export type UpdateSizeChartDto = z.infer<typeof updateSizeChartSchema>;
