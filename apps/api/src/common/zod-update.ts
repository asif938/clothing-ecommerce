import { z } from "zod";

/**
 * PATCH schema from a create schema: every field optional, with the create
 * schema's `.default(...)`s removed.
 *
 * `createSchema.partial()` is NOT that: zod still applies a field's default
 * when the key is absent, so `{ isActive: false }` parsed into
 * `{ isActive: false, priority: 0, matchAreaIds: [], ... }` and a plain
 * on/off toggle silently reset every other column to its create-time
 * default.
 */
export function updateSchemaFrom<Shape extends z.ZodRawShape>(createSchema: z.ZodObject<Shape>) {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(createSchema.shape)) {
    const inner = field instanceof z.ZodDefault ? (field.unwrap() as z.ZodType) : (field as z.ZodType);
    shape[key] = inner.optional();
  }
  return z.object(shape) as unknown as z.ZodObject<{ [K in keyof Shape]: z.ZodOptional<Shape[K] extends z.ZodDefault<infer I extends z.ZodType> ? I : Shape[K]> }>;
}
