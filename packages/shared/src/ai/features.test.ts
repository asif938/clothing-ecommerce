import { describe, expect, it } from "vitest";
import { AI_FEATURE_DEFINITIONS, AI_FEATURES, budgetState, estimateAiCostMicroUsd, exampleFromContract, extractJsonObject, parseAiOutput } from "./features.ts";
import { createMockAiDriver } from "../providers/drivers/ai-mock.ts";

describe("estimateAiCostMicroUsd", () => {
  it("converts tokens × cents-per-million into micro-USD, rounding up", () => {
    // 1M input at $4 + 1M output at $20 = $24 = 24,000,000 micro-USD
    expect(estimateAiCostMicroUsd(1_000_000, 1_000_000, 400, 2000)).toBe(24_000_000);
    expect(estimateAiCostMicroUsd(1, 0, 400, 2000)).toBe(4);
    expect(estimateAiCostMicroUsd(1, 0, 1, 0)).toBe(1); // 0.01 rounds up
    expect(estimateAiCostMicroUsd(0, 0, 400, 2000)).toBe(0);
  });
});

describe("budgetState", () => {
  it("is ok without a budget", () => {
    expect(budgetState(999_999_999, null, 80)).toBe("ok");
  });
  it("alerts at the threshold and stops at the budget", () => {
    // budget 1000 cents = $10 = 10,000,000 micro
    expect(budgetState(7_999_999, 1000, 80)).toBe("ok");
    expect(budgetState(8_000_000, 1000, 80)).toBe("alert");
    expect(budgetState(10_000_000, 1000, 80)).toBe("exceeded");
  });
});

describe("extractJsonObject / parseAiOutput", () => {
  it("tolerates fences and surrounding prose", () => {
    expect(extractJsonObject('Sure!\n```json\n{"alt":{"bn":"ক","en":"a"}}\n```\nDone.')).toEqual({ alt: { bn: "ক", en: "a" } });
    expect(extractJsonObject('Here: {"a":1} thanks')).toEqual({ a: 1 });
  });

  it("throws without JSON", () => {
    expect(() => extractJsonObject("no json here")).toThrow();
  });

  it("validates against the feature's output schema", () => {
    expect(parseAiOutput("seo_meta", '{"seoTitle":{"bn":"ক","en":"a"},"seoDescription":{"bn":"খ","en":"b"}}')).toEqual({ seoTitle: { bn: "ক", en: "a" }, seoDescription: { bn: "খ", en: "b" } });
    expect(() => parseAiOutput("seo_meta", '{"seoTitle":{"bn":"","en":"a"}}')).toThrow();
  });
});

describe("output contracts and the mock driver", () => {
  it("every feature's contract carries an example the mock can echo and the parser accepts", async () => {
    const driver = createMockAiDriver({ simulate: "success", defaultModel: "mock", inputCentsPerMTok: 0, outputCentsPerMTok: 0, delayMs: 0 });
    for (const feature of AI_FEATURES.filter((f) => !AI_FEATURE_DEFINITIONS[f].chat)) {
      const contract = AI_FEATURE_DEFINITIONS[feature].outputContract;
      expect(exampleFromContract(contract)).not.toBeNull();
      const reply = await driver.generate({ model: "mock", system: "sys", prompt: `do it\n\n${contract}`, maxTokens: 100 });
      expect(() => parseAiOutput(feature, reply.text)).not.toThrow();
      expect(reply.outputTokens).toBeGreaterThan(0);
    }
  });

  it("can simulate failure", async () => {
    const driver = createMockAiDriver({ simulate: "failure", defaultModel: "mock", inputCentsPerMTok: 0, outputCentsPerMTok: 0, delayMs: 0 });
    await expect(driver.generate({ model: "mock", system: "", prompt: "", maxTokens: 1 })).rejects.toThrow();
  });
});
