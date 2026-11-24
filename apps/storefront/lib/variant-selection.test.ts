import { describe, expect, it } from "vitest";
import { initialSelection, isValueAvailable, matchVariant, planQuickAdd, type SelectableOption, type SelectableVariant } from "./variant-selection";

const color: SelectableOption = { id: "c", type: "color", values: [{ id: "red" }, { id: "blue" }] };
const size: SelectableOption = { id: "s", type: "size", values: [{ id: "M" }, { id: "L" }] };

function v(id: string, ids: string[], available = true, isActive = true): SelectableVariant {
  return { id, optionValueIds: ids, available, isActive };
}

describe("planQuickAdd", () => {
  it("adds straight away when there is nothing to choose", () => {
    expect(planQuickAdd({ productType: "standard", options: [], variants: [v("v1", [])] })).toEqual({ kind: "add", variantId: "v1" });
    const free: SelectableOption = { id: "s", type: "size", values: [{ id: "free" }] };
    expect(planQuickAdd({ productType: "standard", options: [free], variants: [v("v1", ["free"])] })).toEqual({ kind: "add", variantId: "v1" });
  });

  it("asks for a choice when an option has several values", () => {
    expect(planQuickAdd({ productType: "standard", options: [size], variants: [v("m", ["M"]), v("l", ["L"])] })).toEqual({ kind: "choose" });
  });

  it("reports sold out when nothing can be bought, but lets preorders through", () => {
    const variants = [v("m", ["M"], false), v("l", ["L"], false)];
    expect(planQuickAdd({ productType: "standard", options: [size], variants })).toEqual({ kind: "sold_out" });
    expect(planQuickAdd({ productType: "preorder", options: [size], variants })).toEqual({ kind: "choose" });
    expect(planQuickAdd({ productType: "standard", options: [], variants: [v("v1", [], true, false)] })).toEqual({ kind: "sold_out" });
  });

  it("sends bundles to their own page", () => {
    expect(planQuickAdd({ productType: "bundle", options: [], variants: [v("v1", [])] })).toEqual({ kind: "open_page" });
  });
});

describe("selection", () => {
  const variants = [v("red-M", ["red", "M"], false), v("red-L", ["red", "L"], false), v("blue-M", ["blue", "M"]), v("blue-L", ["blue", "L"], false)];

  it("pre-picks the first colour that can be bought, never the size", () => {
    expect(initialSelection([color, size], variants, false)).toEqual({ c: "blue" });
  });

  it("marks sizes unavailable for the chosen colour", () => {
    expect(isValueAvailable([color, size], variants, { c: "blue" }, "s", "M", false)).toBe(true);
    expect(isValueAvailable([color, size], variants, { c: "blue" }, "s", "L", false)).toBe(false);
  });

  it("matches a variant only once every option is chosen", () => {
    expect(matchVariant([color, size], variants, { c: "blue" })).toBeNull();
    expect(matchVariant([color, size], variants, { c: "blue", s: "M" })?.id).toBe("blue-M");
  });
});
