import { describe, expect, it } from "vitest";
import { z } from "zod";
import { describeConfigFields } from "./config-fields.ts";
import { PROVIDER_DRIVER_CATALOG, getDriverDefinition } from "./catalog.ts";

describe("describeConfigFields", () => {
  it("describes every catalog driver without throwing, one field per schema key", () => {
    for (const definition of PROVIDER_DRIVER_CATALOG) {
      const fields = describeConfigFields(definition);
      const shape = (definition.configSchema as unknown as { shape?: Record<string, unknown> }).shape;
      if (shape) expect(fields.map((f) => f.key).sort(), `${definition.capability}:${definition.driver}`).toEqual(Object.keys(shape).sort());
    }
  });

  it("maps the Cloudinary config to text, secret, nullable url and boolean fields", () => {
    const fields = describeConfigFields(getDriverDefinition("storage", "cloudinary")!);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.cloudName).toMatchObject({ kind: "text", required: true });
    expect(byKey.apiSecret).toMatchObject({ kind: "secret", required: true });
    expect(byKey.folderPrefix).toMatchObject({ kind: "text", required: false, defaultValue: "" });
    expect(byKey.deliveryDomain).toMatchObject({ kind: "text", nullable: true, required: false, format: "url" });
    expect(byKey.mock).toMatchObject({ kind: "boolean", defaultValue: false });
  });

  it("handles enums, numbers, records and input-side transforms", () => {
    const schema = z.object({
      mode: z.enum(["a", "b"]).default("a"),
      port: z.number().int().min(1).max(65535),
      params: z.record(z.string(), z.string()).default({}),
      account: z.string().min(1).transform((v) => v.trim()),
      token: z.string().optional(),
    });
    const fields = describeConfigFields({ configSchema: schema as unknown as z.ZodType<Record<string, unknown>>, secretFields: ["token"] });
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.mode).toMatchObject({ kind: "select", options: ["a", "b"], required: false });
    expect(byKey.port).toMatchObject({ kind: "number", integer: true, min: 1, max: 65535, required: true });
    expect(byKey.params).toMatchObject({ kind: "json" });
    expect(byKey.account).toMatchObject({ kind: "text", required: true });
    expect(byKey.token).toMatchObject({ kind: "secret", required: false });
  });
});
