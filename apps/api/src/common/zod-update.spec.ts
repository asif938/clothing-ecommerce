import { describe, expect, it } from "vitest";
import { z } from "zod";
import { updateSchemaFrom } from "./zod-update";
import { updateZoneSchema } from "../shipping/dto";

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
