import { describe, expect, it } from "vitest";
import { format, readListingConfig, readShopConfig } from "./listing-config";

describe("readListingConfig", () => {
  it("uses safe defaults when settings are missing or invalid", () => {
    expect(readListingConfig({ "listing.pageSize": "7", "listing.defaultView": "huge", "listing.defaultSort": "random" })).toEqual({
      pageSize: 24,
      defaultSort: "relevance",
      viewSwitcher: true,
      defaultView: "grid",
      filters: { categories: true, attributes: true, price: true, onSale: true, inStock: true },
    });
    expect(readShopConfig({})).toEqual({ enabled: true, searchBox: true });
  });

  it("reads the admin's choices", () => {
    const config = readListingConfig({ "listing.pageSize": "36", "listing.defaultView": "list", "listing.defaultSort": "newest", "listing.viewSwitcher": false, "listing.filters.price": false });
    expect(config).toMatchObject({ pageSize: 36, defaultView: "list", defaultSort: "newest", viewSwitcher: false, filters: { price: false, onSale: true } });
  });
});

describe("format", () => {
  it("fills placeholders and leaves unknown ones", () => {
    expect(format("Showing {shown} of {total}", { shown: 24, total: 80 })).toBe("Showing 24 of 80");
    expect(format("{count}টি পণ্য {x}", { count: 3 })).toBe("3টি পণ্য {x}");
  });
});
