import { describe, expect, it, vi } from "vitest";
import { StoreUiStringsController } from "./store-ui-strings.controller";

describe("StoreUiStringsController", () => {
  it("returns only storefront.* strings, keyed by key", async () => {
    const findMany = vi.fn().mockResolvedValue([{ key: "storefront.header.cart", bn: "কার্ট", en: "Cart" }]);
    const controller = new StoreUiStringsController({ uiString: { findMany } } as never);

    expect(await controller.list()).toEqual({ "storefront.header.cart": { bn: "কার্ট", en: "Cart" } });
    // Admin copy (auth.*, settings.* …) is never exposed by the public endpoint.
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { key: { startsWith: "storefront." } } }));
  });
});
