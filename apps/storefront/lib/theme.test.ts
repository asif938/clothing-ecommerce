import { describe, expect, it } from "vitest";
import { pickForegroundColor } from "./theme";

describe("pickForegroundColor", () => {
  it("picks dark text on a light background", () => {
    expect(pickForegroundColor("#ffffff")).toBe("#111111");
  });

  it("picks light text on a dark background", () => {
    expect(pickForegroundColor("#111111")).toBe("#ffffff");
  });

  it("falls back to white text for an invalid hex", () => {
    expect(pickForegroundColor("not-a-color")).toBe("#ffffff");
  });
});
