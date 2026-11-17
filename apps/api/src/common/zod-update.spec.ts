import { describe, expect, it } from "vitest";
import { z } from "zod";
import { updateSchemaFrom } from "./zod-update";
import { updateRateSchema, updateZoneSchema } from "../shipping/dto";
import { updateCourierAreaMappingSchema } from "../courier-area-mapping/dto";
import { updateSegmentSchema } from "../customers/dto";
import { updateDiscountSchema, updateFlashSaleSchema } from "../discounts/dto";
import { updatePaymentRuleSchema } from "../payment-rules/dto";
import { updateProviderInstanceSchema } from "../providers/dto";
import { updateReturnReasonSchema } from "../returns/dto";
import { updateSearchSynonymSchema } from "../search/dto";

describe("updateSchemaFrom", () => {
  const create = z.object({
    name: z.string().min(1),
    priority: z.number().int().default(0),
    tags: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
  });
  const update = updateSchemaFrom(create);

  it("keeps only the keys that were sent — no create-time defaults", () => {
    expect(update.parse({ isActive: false })).toEqual({ isActive: false });
    expect(update.parse({})).toEqual({});
  });

  it("still validates the fields that are sent", () => {
    expect(() => update.parse({ priority: "high" })).toThrow();
    expect(() => update.parse({ name: "" })).toThrow();
    expect(update.parse({ tags: ["a"], priority: 5 })).toEqual({ tags: ["a"], priority: 5 });
  });

  it("toggling a shipping zone does not wipe its matched locations", () => {
    expect(updateZoneSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });
});

describe("every admin PATCH schema built from a create schema with defaults", () => {
  const schemas = {
    updateZoneSchema,
    updateRateSchema,
    updateCourierAreaMappingSchema,
    updateSegmentSchema,
    updateDiscountSchema,
    updateFlashSaleSchema,
    updatePaymentRuleSchema,
    updateProviderInstanceSchema,
    updateReturnReasonSchema,
    updateSearchSynonymSchema,
  };

  it.each(Object.entries(schemas))("%s adds no fields the request did not send", (_name, schema) => {
    expect(schema.parse({})).toEqual({});
  });

  it("switching an integration off keeps its mode, default flag and config", () => {
    expect(updateProviderInstanceSchema.parse({ enabled: false })).toEqual({ enabled: false });
  });

  it("switching a payment rule off keeps its conditions and actions", () => {
    expect(updatePaymentRuleSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });
});
