import { describe, expect, it } from "vitest";
import { excerptReview, maskReviewerName } from "./review-display.ts";

describe("maskReviewerName", () => {
  it("keeps the first name and the last name's initial", () => {
    expect(maskReviewerName("Rahim Uddin Khan")).toBe("Rahim K.");
    expect(maskReviewerName("  nusrat   jahan ")).toBe("nusrat J.");
  });

  it("keeps a single name as is", () => {
    expect(maskReviewerName("Tania")).toBe("Tania");
  });

  it("handles Bangla names without breaking characters", () => {
    expect(maskReviewerName("রহিম খান")).toBe("রহিম খ.");
  });

  it("returns null when there is no name", () => {
    expect(maskReviewerName(null)).toBeNull();
    expect(maskReviewerName("   ")).toBeNull();
  });
});

describe("excerptReview", () => {
  it("leaves short text alone and collapses whitespace", () => {
    expect(excerptReview("Great   fit\nand fabric", 100)).toBe("Great fit and fabric");
  });

  it("cuts long text at a word boundary with an ellipsis", () => {
    expect(excerptReview("The fabric is soft and the stitching is very neat", 30)).toBe("The fabric is soft and the…");
  });
});
