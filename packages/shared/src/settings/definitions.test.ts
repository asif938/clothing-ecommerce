import { describe, expect, it } from "vitest";
import "./definitions";
import { listSettingDefinitions, listPublicSettingDefinitions, validateSettingValue } from "./registry";

describe("Milestone 1 setting definitions", () => {
  it("register without throwing and validate their own defaults", () => {
    const definitions = listSettingDefinitions();
    expect(definitions.length).toBeGreaterThan(0);
    for (const definition of definitions) {
      const result = validateSettingValue(definition.key, definition.default);
      expect(result.success, `default for "${definition.key}" should validate`).toBe(true);
    }
  });

  it("marks brand/locale/theme settings public and security settings private", () => {
    const publicKeys = listPublicSettingDefinitions().map((d) => d.key);
    expect(publicKeys).toContain("brand.name");
    expect(publicKeys).toContain("locale.default");
    expect(publicKeys).not.toContain("security.staffSessionTtlHours");
  });
});
