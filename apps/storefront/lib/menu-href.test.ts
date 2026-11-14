import { describe, expect, it } from "vitest";
import { isExternalHref, menuHref } from "./menu-href";
import { uiText } from "./ui-text";

describe("menuHref", () => {
  it("maps each target type to its slug route", () => {
    expect(menuHref({ type: "category", targetId: "men-panjabi" })).toBe("/c/men-panjabi");
    expect(menuHref({ type: "collection", targetId: "eid-2027" })).toBe("/collections/eid-2027");
    expect(menuHref({ type: "product", targetId: "katan-silk-saree" })).toBe("/p/katan-silk-saree");
    expect(menuHref({ type: "page", targetId: "about" })).toBe("/pages/about");
    expect(menuHref({ type: "url", url: "https://facebook.com/demo" })).toBe("https://facebook.com/demo");
  });

  it("returns null (a plain heading) when there is no target", () => {
    expect(menuHref({ type: "category" })).toBeNull();
    expect(menuHref({ type: "url", url: "  " })).toBeNull();
  });

  it("encodes slugs", () => {
    expect(menuHref({ type: "page", targetId: "a b" })).toBe("/pages/a%20b");
  });
});

describe("isExternalHref", () => {
  it("detects other hosts and mail/tel links", () => {
    expect(isExternalHref("https://x.com")).toBe(true);
    expect(isExternalHref("//cdn.x.com/a")).toBe(true);
    expect(isExternalHref("tel:+8801700000000")).toBe(true);
    expect(isExternalHref("/c/men")).toBe(false);
  });
});

describe("uiText", () => {
  it("prefers the database value, then the seeded default, then the other language, then the key", () => {
    const text = uiText({ "storefront.header.cart": { bn: "ঝুড়ি" }, "custom.only.en": { en: "Only English" } }, "bn");
    expect(text("storefront.header.cart")).toBe("ঝুড়ি");
    expect(text("storefront.header.wishlist")).toBe("উইশলিস্ট");
    expect(text("custom.only.en")).toBe("Only English");
    expect(text("missing.key")).toBe("missing.key");
    expect(uiText({}, "en")("storefront.header.cart")).toBe("Cart");
  });
});
