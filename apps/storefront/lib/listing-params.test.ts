import { describe, expect, it } from "vitest";
import { buildListingQuery, clearFilters, countActiveFilters, isFilteredListing, parseListingSearchParams, setParam, toggleListValue } from "./listing-params";

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

describe("listing URL helpers", () => {
  it("uses the admin default sort when the URL has none", () => {
    expect(parseListingSearchParams({}, "newest").params.sort).toBe("newest");
    expect(parseListingSearchParams({ sort: "price_asc" }, "newest").params.sort).toBe("price_asc");
  });

  it("parses search, categories and on-sale, and ignores bad numbers", () => {
    const { params } = parseListingSearchParams({ q: "  panjabi ", categoryIds: "men,kids", onSale: "true", priceMin: "-5", page: "0" });
    expect(params).toMatchObject({ q: "panjabi", categoryIds: ["men", "kids"], onSale: true, priceMin: undefined, page: 1 });
  });

  it("builds the API query for load more", () => {
    const query = buildListingQuery({ categoryIds: ["men"], q: "shirt", onSale: true, page: 2, pageSize: 24, sort: "newest", attributes: { size: ["m", "l"] } });
    expect(Object.fromEntries(query)).toEqual({ q: "shirt", categoryIds: "men", onSale: "true", sort: "newest", page: "2", pageSize: "24", attr_size: "m,l" });
  });

  it("counts filters, toggles values and clears filters but keeps sort", () => {
    let params = new URLSearchParams("sort=newest&page=3&utm_source=fb");
    params = toggleListValue(params, "attr_size", "m");
    params = toggleListValue(params, "attr_size", "l");
    params = setParam(params, "onSale", "true");
    params = setParam(params, "priceMin", "50000");
    expect(params.get("page")).toBeNull();
    expect(countActiveFilters(params)).toBe(4);
    expect(isFilteredListing(params)).toBe(true);
    params = toggleListValue(params, "attr_size", "m");
    expect(params.get("attr_size")).toBe("l");
    const cleared = clearFilters(setParam(params, "q", "saree"));
    expect(Object.fromEntries(cleared)).toEqual({ sort: "newest", utm_source: "fb" });
    expect(isFilteredListing(cleared)).toBe(false);
  });
});
