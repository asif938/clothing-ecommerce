import { describe, expect, it } from "vitest";
import { signReviewToken, verifyReviewToken } from "./review-link";

const KEY = "test-encryption-key-0123456789";

describe("review link tokens", () => {
  it("round-trips an order id", () => {
    const token = signReviewToken("ck9order123abc", KEY);
    expect(verifyReviewToken(token, KEY)).toBe("ck9order123abc");
  });

  it("rejects a tampered order id, a wrong key and junk", () => {
    const token = signReviewToken("ck9order123abc", KEY);
    const sig = token.slice(token.indexOf("-") + 1);
    expect(verifyReviewToken(`ck9order999abc-${sig}`, KEY)).toBeNull();
    expect(token).not.toContain(".");
    expect(verifyReviewToken(token, "another-key-0123456789")).toBeNull();
    expect(verifyReviewToken("noseparator", KEY)).toBeNull();
    expect(verifyReviewToken("-abc", KEY)).toBeNull();
  });
});
