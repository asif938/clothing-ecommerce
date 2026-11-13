import { describe, expect, it } from "vitest";
import { AUTOMATION_TRIGGER_KEYS } from "../automation/rules.ts";
import {
  API_SCOPE_KEYS,
  CONFIG_BUNDLE_SECTION_KEYS,
  DEFAULT_EXPENSE_CATEGORIES,
  REPORT_DATASETS,
  WEBHOOK_EVENT_KEYS,
  expenseCategoryListSchema,
  reportConfigSchema,
  validateReportConfig,
} from "./index.ts";

describe("report datasets", () => {
  it.each(Object.values(REPORT_DATASETS))("$key has unique, bilingual dimensions and metrics", (dataset) => {
    for (const list of [dataset.dimensions, dataset.metrics]) {
      expect(new Set(list.map((f) => f.key)).size).toBe(list.length);
      for (const field of list) {
        expect(field.label.bn.length).toBeGreaterThan(0);
        expect(field.label.en.length).toBeGreaterThan(0);
      }
    }
  });

  it("never lets a dimension and a metric share a key (sorting would be ambiguous)", () => {
    for (const dataset of Object.values(REPORT_DATASETS)) {
      const metrics = new Set(dataset.metrics.map((m) => m.key));
      expect(dataset.dimensions.filter((d) => metrics.has(d.key))).toEqual([]);
    }
  });
});

describe("reportConfigSchema", () => {
  it("fills in defaults", () => {
    const config = reportConfigSchema.parse({ dataset: "sales", dimensions: [], metrics: ["orders"] });
    expect(config).toMatchObject({ filters: [], sort: null, limit: 500, includeUnsold: false });
  });

  it("limits grouping to two dimensions and rejects an empty metric list", () => {
    expect(reportConfigSchema.safeParse({ dataset: "sales", dimensions: ["day", "channel", "status"], metrics: ["orders"] }).success).toBe(false);
    expect(reportConfigSchema.safeParse({ dataset: "sales", dimensions: [], metrics: [] }).success).toBe(false);
  });

  it("checks fields against the chosen dataset", () => {
    const parse = (over: object) => reportConfigSchema.parse({ dataset: "products", dimensions: ["category"], metrics: ["units"], ...over });
    expect(validateReportConfig(parse({}))).toBeNull();
    expect(validateReportConfig(parse({ metrics: ["aov"] }))).toMatch(/Unknown metric/);
    expect(validateReportConfig(parse({ dimensions: ["status"] }))).toMatch(/Unknown dimension/);
  });
});

describe("expense categories", () => {
  it("ships a valid default list", () => {
    expect(expenseCategoryListSchema.safeParse(DEFAULT_EXPENSE_CATEGORIES).success).toBe(true);
  });

  it("rejects duplicate or malformed keys", () => {
    const label = { bn: "ক", en: "A" };
    expect(expenseCategoryListSchema.safeParse([{ key: "a", label }, { key: "a", label }]).success).toBe(false);
    expect(expenseCategoryListSchema.safeParse([{ key: "Has Space", label }]).success).toBe(false);
    expect(expenseCategoryListSchema.safeParse([]).success).toBe(false);
  });
});

describe("platform constants", () => {
  it("lets webhooks subscribe to every order lifecycle trigger plus the test ping", () => {
    for (const trigger of AUTOMATION_TRIGGER_KEYS) expect(WEBHOOK_EVENT_KEYS).toContain(trigger);
    expect(WEBHOOK_EVENT_KEYS).toContain("webhook.test");
  });

  it("only offers read scopes on the public API", () => {
    expect(API_SCOPE_KEYS.every((s) => s.endsWith(".read"))).toBe(true);
  });

  it("applies config sections in a stable order with settings first", () => {
    expect(CONFIG_BUNDLE_SECTION_KEYS[0]).toBe("settings");
    expect(new Set(CONFIG_BUNDLE_SECTION_KEYS).size).toBe(CONFIG_BUNDLE_SECTION_KEYS.length);
  });
});
