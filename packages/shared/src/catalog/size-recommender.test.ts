import { describe, expect, it } from "vitest";
import { recommendSize, type SizeChartRow } from "./size-recommender.ts";

const ROWS: SizeChartRow[] = [
  { size: "S", measurements: { chest: 90, waist: 76 } },
  { size: "M", measurements: { chest: 96, waist: 82 } },
  { size: "L", measurements: { chest: 102, waist: 88 } },
  { size: "XL", measurements: { chest: 108, waist: 94 } },
];

describe("recommendSize", () => {
  it("returns null for an empty chart", () => {
    expect(recommendSize([], { chestCm: 96 })).toBeNull();
  });

  it("returns null when nothing the customer gave matches a chart column", () => {
    expect(recommendSize(ROWS, { heightCm: 170 })).toBeNull();
  });

  it("picks the nearest row by default (regular fit)", () => {
    const result = recommendSize(ROWS, { chestCm: 97, waistCm: 83 });
    expect(result?.size).toBe("M");
    expect(result?.matchedColumns).toEqual(["chest", "waist"]);
  });

  it("picks the exact row when measurements match exactly", () => {
    expect(recommendSize(ROWS, { chestCm: 102, waistCm: 88 })?.size).toBe("L");
  });

  it("shifts one size down for a snug fit preference", () => {
    const result = recommendSize(ROWS, { chestCm: 96, waistCm: 82 }, "snug");
    expect(result?.size).toBe("S");
  });

  it("shifts one size up for a loose fit preference", () => {
    const result = recommendSize(ROWS, { chestCm: 96, waistCm: 82 }, "loose");
    expect(result?.size).toBe("L");
  });

  it("doesn't shift past the first/last row", () => {
    expect(recommendSize(ROWS, { chestCm: 90, waistCm: 76 }, "snug")?.size).toBe("S");
    expect(recommendSize(ROWS, { chestCm: 108, waistCm: 94 }, "loose")?.size).toBe("XL");
  });

  it("reports low confidence for a distant match", () => {
    const result = recommendSize(ROWS, { chestCm: 140, waistCm: 120 });
    expect(result?.confidence).toBe("low");
  });

  it("matches on a single available column", () => {
    const result = recommendSize(ROWS, { chestCm: 96 });
    expect(result?.size).toBe("M");
    expect(result?.matchedColumns).toEqual(["chest"]);
  });

  it("is case-insensitive on column keys and accepts bust as chest", () => {
    const bustRows: SizeChartRow[] = [{ size: "M", measurements: { Bust: 96 } }];
    expect(recommendSize(bustRows, { chestCm: 96 })?.size).toBe("M");
  });
});
