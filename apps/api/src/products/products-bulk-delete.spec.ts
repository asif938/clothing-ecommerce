import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { ProductsService } from "./products.service";
import { bulkDeleteProductsSchema } from "./dto";
import type { AuthenticatedStaff } from "../common/types";

const actor = { id: "staff-1" } as AuthenticatedStaff;

/** removeMany only orchestrates `remove`, so the service is built without its dependencies and `remove` is stubbed. */
function serviceWithRemove(remove: (id: string) => Promise<void>) {
  const service = Object.create(ProductsService.prototype) as ProductsService;
  service.remove = vi.fn((id: string) => remove(id));
  return service;
}

describe("ProductsService.removeMany", () => {
  it("deletes every product once, even when an id is sent twice", async () => {
    const service = serviceWithRemove(() => Promise.resolve());
    const result = await service.removeMany(["p1", "p2", "p1"], actor);
    expect(result).toEqual({ deleted: 2, failed: [] });
    expect(service.remove).toHaveBeenCalledTimes(2);
  });

  it("keeps going past a product that can't be deleted and reports it", async () => {
    const service = serviceWithRemove((id) => (id === "gone" ? Promise.reject(new NotFoundException("Product not found")) : Promise.resolve()));
    const result = await service.removeMany(["p1", "gone", "p2"], actor);
    expect(result.deleted).toBe(2);
    expect(result.failed).toEqual([{ id: "gone", message: "Product not found" }]);
  });
});

describe("bulkDeleteProductsSchema", () => {
  it("needs at least one id and caps a single request at 200", () => {
    expect(() => bulkDeleteProductsSchema.parse({ ids: [] })).toThrow();
    expect(() => bulkDeleteProductsSchema.parse({ ids: Array.from({ length: 201 }, (_, i) => `p${i}`) })).toThrow();
    expect(bulkDeleteProductsSchema.parse({ ids: ["p1"] })).toEqual({ ids: ["p1"] });
  });
});
