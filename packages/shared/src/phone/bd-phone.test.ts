import { describe, expect, it } from "vitest";
import { formatBdPhoneDisplay, isValidBdPhone, maskBdPhoneDisplay, normalizeBdPhone } from "./bd-phone.ts";

describe("normalizeBdPhone", () => {
  it("normalizes 01XXXXXXXXX", () => {
    expect(normalizeBdPhone("01712345678")).toBe("+8801712345678");
  });

  it("normalizes +8801XXXXXXXXX (already E.164)", () => {
    expect(normalizeBdPhone("+8801712345678")).toBe("+8801712345678");
  });

  it("normalizes 8801XXXXXXXXX (no plus)", () => {
    expect(normalizeBdPhone("8801712345678")).toBe("+8801712345678");
  });

  it("strips spaces and dashes", () => {
    expect(normalizeBdPhone("01712-345 678")).toBe("+8801712345678");
  });

  it("converts Bangla digits", () => {
    expect(normalizeBdPhone("০১৭১২৩৪৫৬৭৮")).toBe("+8801712345678");
  });

  it("rejects an invalid operator prefix", () => {
    expect(normalizeBdPhone("01212345678")).toBeNull();
  });

  it("rejects too few digits", () => {
    expect(normalizeBdPhone("0171234")).toBeNull();
  });

  it("rejects an unrecognizable shape", () => {
    expect(normalizeBdPhone("not-a-phone")).toBeNull();
  });
});

describe("isValidBdPhone", () => {
  it("mirrors normalizeBdPhone's success/failure", () => {
    expect(isValidBdPhone("01712345678")).toBe(true);
    expect(isValidBdPhone("0121234567")).toBe(false);
  });
});

describe("display formatting", () => {
  it("formats as 01XXX-XXXXXX", () => {
    expect(formatBdPhoneDisplay("+8801712345678")).toBe("01712-345678");
  });

  it("masks the last 3 digits", () => {
    expect(maskBdPhoneDisplay("+8801712345678")).toBe("01712-XXX678");
  });
});
