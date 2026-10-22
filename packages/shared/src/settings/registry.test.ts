import { z } from "zod";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetRegistryForTests, defineSetting, getSettingDefinition, listSettingGroups, validateSettingValue } from "./registry";

describe("settings registry", () => {
  beforeEach(() => {
    __resetRegistryForTests();
  });

  it("registers a setting and resolves it by key", () => {
    defineSetting({
      key: "test.flag",
      group: "test",
      type: z.boolean(),
      default: false,
      label: { en: "Flag" },
      permission: "settings.read",
      ui: { widget: "toggle" },
    });
    expect(getSettingDefinition("test.flag")?.default).toBe(false);
    expect(listSettingGroups()).toEqual(["test"]);
  });

  it("rejects defining the same key twice", () => {
    defineSetting({
      key: "test.dup",
      group: "test",
      type: z.string(),
      default: "",
      label: { en: "Dup" },
      permission: "settings.read",
      ui: { widget: "text" },
    });
    expect(() =>
      defineSetting({
        key: "test.dup",
        group: "test",
        type: z.string(),
        default: "",
        label: { en: "Dup" },
        permission: "settings.read",
        ui: { widget: "text" },
      }),
    ).toThrow();
  });

  it("rejects a setting that references an unknown permission", () => {
    expect(() =>
      defineSetting({
        key: "test.bad",
        group: "test",
        type: z.string(),
        default: "",
        label: { en: "Bad" },
        permission: "not.a.real.permission",
        ui: { widget: "text" },
      }),
    ).toThrow();
  });

  it("validates values against the setting's zod type", () => {
    defineSetting({
      key: "test.threshold",
      group: "test",
      type: z.number().int().min(0),
      default: 0,
      label: { en: "Threshold" },
      permission: "settings.read",
      ui: { widget: "text" },
    });
    expect(validateSettingValue("test.threshold", 5)).toEqual({ success: true, data: 5 });
    expect(validateSettingValue("test.threshold", -1).success).toBe(false);
    expect(validateSettingValue("test.unknown", 5).success).toBe(false);
  });
});
