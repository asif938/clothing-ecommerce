import { z } from "zod";

const localizedName = z.object({ bn: z.string().trim().max(200).default(""), en: z.string().trim().max(200).default("") }).refine((n) => n.bn !== "" || n.en !== "", "Give the material a name in at least one language");

export const createMaterialSchema = z.object({
  sku: z.string().trim().min(1).max(60),
  name: localizedName,
  /** Whole-number unit of stock — choose a fine one (cm, g, pcs) so quantities stay integers. */
  unit: z.string().trim().min(1).max(20),
  // Poisha per one `unit` (golden rule 3).
  costPrice: z.number().int().min(0).default(0),
  reorderPoint: z.number().int().min(0).default(0),
  supplierId: z.string().min(1).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  /** Stock on hand when the material is first recorded. */
  openingQuantity: z.number().int().min(0).default(0),
});
export type CreateMaterialDto = z.infer<typeof createMaterialSchema>;

export const updateMaterialSchema = z.object({
  name: localizedName.optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  costPrice: z.number().int().min(0).optional(),
  reorderPoint: z.number().int().min(0).optional(),
  supplierId: z.string().min(1).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateMaterialDto = z.infer<typeof updateMaterialSchema>;

export const listMaterialsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  lowStock: z.enum(["true", "false"]).optional(),
  includeInactive: z.enum(["true", "false"]).optional(),
});
export type ListMaterialsQueryDto = z.infer<typeof listMaterialsQuerySchema>;

export const receiveMaterialSchema = z.object({
  quantity: z.number().int().min(1).max(100_000_000),
  /** Poisha per unit on this delivery; blended into the material's cost per `procurement.costMethod`. */
  unitCost: z.number().int().min(0),
  note: z.string().trim().max(500).nullable().optional(),
});
export type ReceiveMaterialDto = z.infer<typeof receiveMaterialSchema>;

export const adjustMaterialSchema = z.object({
  /** Positive adds, negative removes. */
  delta: z.number().int().refine((n) => n !== 0, "Adjustment can't be zero"),
  note: z.string().trim().min(1, "A reason is required").max(500),
});
export type AdjustMaterialDto = z.infer<typeof adjustMaterialSchema>;

export const setBomSchema = z
  .object({
    lines: z
      .array(
        z.object({
          materialId: z.string().min(1),
          /** null = every variant of the product. */
          variantId: z.string().min(1).nullable().default(null),
          quantity: z.number().int().min(1).max(100_000_000),
          wastagePercent: z.number().int().min(0).max(100).default(0),
          note: z.string().trim().max(200).nullable().optional(),
        }),
      )
      .max(100),
  })
  .refine((dto) => new Set(dto.lines.map((l) => `${l.variantId ?? ""}|${l.materialId}`)).size === dto.lines.length, {
    message: "Each material may appear once per variant (or once product-wide)",
    path: ["lines"],
  });
export type SetBomDto = z.infer<typeof setBomSchema>;

export const requirementsSchema = z.object({
  items: z
    .array(z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1).max(1_000_000) }))
    .min(1)
    .max(500)
    .refine((items) => new Set(items.map((i) => i.variantId)).size === items.length, "Each variant may appear only once"),
});
export type RequirementsDto = z.infer<typeof requirementsSchema>;
