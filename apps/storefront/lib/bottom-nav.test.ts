import { describe, expect, it } from "vitest";
import { activeBottomNavItem, isBottomNavHidden, readBottomNavConfig } from "./bottom-nav";

describe("readBottomNavConfig", () => {
  it("defaults to on with home, shop, wishlist, cart, account", () => {
    expect(readBottomNavConfig({})).toEqual({ enabled: true, items: ["home", "shop", "wishlist", "cart", "account"] });
  });

  it("reads the admin's tabs, dropping unknown and repeated ones, at most five", () => {
    expect(readBottomNavConfig({ "theme.bottomNav.enabled": false, "theme.bottomNav.items": ["cart", "bogus", "cart", "home", "search", "track", "account", "shop"] })).toEqual({
      enabled: false,
      items: ["cart", "home", "search", "track", "account"],
    });
  });

  it("falls back to the default when fewer than two valid tabs remain", () => {
    expect(readBottomNavConfig({ "theme.bottomNav.items": ["home"] }).items).toHaveLength(5);
  });
});

describe("where the bar shows", () => {
  it("hides on product, checkout and order-confirmation pages only", () => {
    expect(isBottomNavHidden("/p/jamdani-saree")).toBe(true);
    expect(isBottomNavHidden("/checkout")).toBe(true);
    expect(isBottomNavHidden("/confirm-order/abc")).toBe(true);
    expect(isBottomNavHidden("/")).toBe(false);
    expect(isBottomNavHidden("/shop")).toBe(false);
    expect(isBottomNavHidden("/cart")).toBe(false);
  });

  it("marks the matching tab active", () => {
    const items = ["home", "shop", "wishlist", "cart", "account"] as const;
    expect(activeBottomNavItem("/", [...items])).toBe("home");
    expect(activeBottomNavItem("/c/women", [...items])).toBe("shop");
    expect(activeBottomNavItem("/account/orders/1", [...items])).toBe("account");
    expect(activeBottomNavItem("/pages/about", [...items])).toBeNull();
    expect(activeBottomNavItem("/cartoon", [...items])).toBeNull();
  });
});
