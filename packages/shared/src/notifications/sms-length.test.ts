import { describe, expect, it } from "vitest";
import { estimateSmsCostPoisha, estimateSmsLength, isGsm7Text } from "./sms-length.ts";

describe("isGsm7Text", () => {
  it("accepts plain ASCII/GSM-7 text", () => {
    expect(isGsm7Text("Your order ORD-1001 is confirmed.")).toBe(true);
  });

  it("rejects Bangla text", () => {
    expect(isGsm7Text("আপনার অর্ডার কনফার্ম হয়েছে")).toBe(false);
  });
});

describe("estimateSmsLength", () => {
  it("fits a short GSM-7 message in one segment", () => {
    const text = "Your order is confirmed.";
    expect(estimateSmsLength(text)).toEqual({ encoding: "gsm7", characters: text.length, segments: 1 });
  });

  it("splits a long GSM-7 message into multiple segments at the 153-char concat limit", () => {
    const text = "a".repeat(200);
    expect(estimateSmsLength(text)).toEqual({ encoding: "gsm7", characters: 200, segments: 2 });
  });

  it("treats any Bangla text as unicode with the 70/67-char limits", () => {
    const text = "আপনার অর্ডার কনফার্ম হয়েছে";
    const result = estimateSmsLength(text);
    expect(result.encoding).toBe("unicode");
    expect(result.segments).toBe(1);
  });

  it("splits a long unicode message at the 67-char concat limit", () => {
    const text = "আ".repeat(140);
    expect(estimateSmsLength(text)).toEqual({ encoding: "unicode", characters: 140, segments: 3 });
  });

  it("returns zero segments for an empty string", () => {
    expect(estimateSmsLength("")).toEqual({ encoding: "gsm7", characters: 0, segments: 0 });
  });
});

describe("estimateSmsCostPoisha", () => {
  it("multiplies segment count by the configured per-segment cost", () => {
    expect(estimateSmsCostPoisha("a".repeat(200), 50)).toBe(100);
  });
});
