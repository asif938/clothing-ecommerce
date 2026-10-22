import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared/i18n";

export const productStatusSchema = z.enum(["draft", "active", "archived", "scheduled"]);
export const productTypeSchema = z.enum(["standard", "bundle", "gift_card", "preorder"]);
export const productOptionTypeSchema = z.enum(["size", "color", "generic"]);
export const productRelationTypeSchema = z.enum(["similar", "complete_the_look", "upsell", "cross_sell"]);

const productAttributeValueInputSchema = z.object({
  attributeId: z.string().min(1),
  attributeValueId: z.string().nullable().optional(),
  valueText: z.string().nullable().optional(),
  valueNumber: z.number().nullable().optional(),
});

export const createProductSchema = z.object({
  title: localizedTextSchema,
  slug: z.string().min(1).optional(),
  subtitle: localizedTextSchema.optional(),
  description: localizedTextSchema.optional(),
  shortDescription: localizedTextSchema.optional(),
  categoryId: z.string().nullable().optional(),
  additionalCategoryIds: z.array(z.string()).optional(),
  brandLabel: localizedTextSchema.optional(),
  tags: z.array(z.string()).optional(),
  status: productStatusSchema.optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  unpublishAt: z.coerce.date().nullable().optional(),
  productType: productTypeSchema.optional(),
  sizeChartId: z.string().nullable().optional(),
  careInstructions: localizedTextSchema.optional(),
  fabric: localizedTextSchema.optional(),
  modelInfo: localizedTextSchema.optional(),
  videoUrl: z.string().nullable().optional(),
  seoTitle: localizedTextSchema.optional(),
  seoDescription: localizedTextSchema.optional(),
  isFeatured: z.boolean().optional(),
  sortWeight: z.number().int().optional(),
  requiresShipping: z.boolean().optional(),
  weightGramsDefault: z.number().int().nullable().optional(),
  hsCode: z.string().nullable().optional(),
  attributeValues: z.array(productAttributeValueInputSchema).optional(),
});
export type CreateProductDto = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductDto = z.infer<typeof updateProductSchema>;

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  status: productStatusSchema.optional(),
  categoryId: z.string().optional(),
  q: z.string().optional(),
});
export type ListProductsQueryDto = z.infer<typeof listProductsQuerySchema>;

// ---------------------------------------------------------------------------
// Options & values
// ---------------------------------------------------------------------------

export const createProductOptionValueSchema = z.object({
  value: localizedTextSchema,
  colorHex: z.string().nullable().optional(),
  swatchImageMediaId: z.string().nullable().optional(),
  position: z.number().int().optional(),
});
export type CreateProductOptionValueDto = z.infer<typeof createProductOptionValueSchema>;
export const updateProductOptionValueSchema = createProductOptionValueSchema.partial();
export type UpdateProductOptionValueDto = z.infer<typeof updateProductOptionValueSchema>;

export const createProductOptionSchema = z.object({
  name: localizedTextSchema,
  type: productOptionTypeSchema,
  sizeSystemId: z.string().nullable().optional(),
  position: z.number().int().optional(),
  values: z.array(createProductOptionValueSchema).optional(),
});
export type CreateProductOptionDto = z.infer<typeof createProductOptionSchema>;

export const updateProductOptionSchema = createProductOptionSchema.omit({ values: true }).partial();
export type UpdateProductOptionDto = z.infer<typeof updateProductOptionSchema>;

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export const updateVariantSchema = z.object({
  sku: z.string().min(1).optional(),
  barcode: z.string().nullable().optional(),
  price: z.number().int().min(0).optional(),
  compareAtPrice: z.number().int().min(0).nullable().optional(),
  costPrice: z.number().int().min(0).nullable().optional(),
  weightGrams: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
  position: z.number().int().optional(),
});
export type UpdateVariantDto = z.infer<typeof updateVariantSchema>;

export const bulkUpdateVariantsSchema = z.discriminatedUnion("field", [
  z.object({ variantIds: z.array(z.string()).min(1), field: z.literal("price"), value: z.number().int().min(0) }),
  z.object({ variantIds: z.array(z.string()).min(1), field: z.literal("compareAtPrice"), value: z.number().int().min(0).nullable() }),
  z.object({ variantIds: z.array(z.string()).min(1), field: z.literal("costPrice"), value: z.number().int().min(0).nullable() }),
  z.object({ variantIds: z.array(z.string()).min(1), field: z.literal("weightGrams"), value: z.number().int().min(0).nullable() }),
  z.object({ variantIds: z.array(z.string()).min(1), field: z.literal("isActive"), value: z.boolean() }),
]);
export type BulkUpdateVariantsDto = z.infer<typeof bulkUpdateVariantsSchema>;

// ---------------------------------------------------------------------------
// Media & relations
// ---------------------------------------------------------------------------

export const addProductMediaSchema = z.object({
  mediaId: z.string().min(1),
  optionValueId: z.string().nullable().optional(),
  position: z.number().int().optional(),
  alt: localizedTextSchema.optional(),
});
export type AddProductMediaDto = z.infer<typeof addProductMediaSchema>;

export const updateProductMediaSchema = addProductMediaSchema.omit({ mediaId: true }).partial();
export type UpdateProductMediaDto = z.infer<typeof updateProductMediaSchema>;

export const addProductRelationSchema = z.object({
  relatedProductId: z.string().min(1),
  type: productRelationTypeSchema,
  position: z.number().int().optional(),
});
export type AddProductRelationDto = z.infer<typeof addProductRelationSchema>;
