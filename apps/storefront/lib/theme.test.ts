import { describe, expect, it } from "vitest";
import { pickForegroundColor, safeHexColor, serializeJsonLd } from "./theme";

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

describe("safeHexColor", () => {
  it("keeps plain hex colors", () => {
    expect(safeHexColor("#1a2B3c", "#111827")).toBe("#1a2B3c");
    expect(safeHexColor("#abc", "#111827")).toBe("#abc");
  });
  it("falls back for anything that could break out of the style block", () => {
    expect(safeHexColor("red; } body { display:none", "#111827")).toBe("#111827");
    expect(safeHexColor("#fff</style><script>alert(1)</script>", "#111827")).toBe("#111827");
    expect(safeHexColor(42, "#111827")).toBe("#111827");
  });
});

describe("serializeJsonLd", () => {
  it("cannot close the script tag it is embedded in", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script");
    expect(out).not.toContain("<");
  });
  it("round-trips to the same data", () => {
    const data = { name: "শাড়ি & Panjabi <new>", price: 150000 };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});
