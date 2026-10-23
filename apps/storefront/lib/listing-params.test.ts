import { describe, expect, it } from "vitest";
import { parseListingSearchParams } from "./listing-params";

describe("parseListingSearchParams", () => {
  it("defaults to page 1, sort relevance, no filters", () => {
    const { params } = parseListingSearchParams({});
    expect(params).toMatchObject({ sort: "relevance", page: 1, inStockOnly: false, attributes: {} });
  });

  it("parses attr_* params into a per-attribute value-id list", () => {
    const { params } = parseListingSearchParams({ attr_color: "red,blue", attr_size: "m" });
    expect(params.attributes).toEqual({ color: ["red", "blue"], size: ["m"] });
  });

  it("falls back to relevance for an unknown sort value", () => {
    const { params } = parseListingSearchParams({ sort: "not-a-real-sort" });
    expect(params.sort).toBe("relevance");
  });

  it("accepts a known sort value", () => {
    const { params } = parseListingSearchParams({ sort: "price_desc" });
    expect(params.sort).toBe("price_desc");
  });

  it("parses price range and in-stock filters", () => {
    const { params } = parseListingSearchParams({ priceMin: "10000", priceMax: "50000", inStockOnly: "true" });
    expect(params).toMatchObject({ priceMin: 10000, priceMax: 50000, inStockOnly: true });
  });

  it("preserves every raw param (including unknown ones) in the returned URLSearchParams", () => {
    const { urlSearchParams } = parseListingSearchParams({ sort: "newest", page: "2", attr_color: "red" });
    expect(urlSearchParams.get("sort")).toBe("newest");
    expect(urlSearchParams.get("page")).toBe("2");
    expect(urlSearchParams.get("attr_color")).toBe("red");
  });

  it("takes the first value when Next hands back an array (repeated query key)", () => {
    const { params } = parseListingSearchParams({ page: ["3", "4"] });
    expect(params.page).toBe(3);
  });
});
