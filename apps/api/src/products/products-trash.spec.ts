import { describe, expect, it, vi } from "vitest";
import { ProductsService } from "./products.service";
import type { AuthenticatedStaff } from "../common/types";

const actor = { id: "staff-1" } as AuthenticatedStaff;

interface ProductRow {
  id: string;
  title: { en: string };
  slug: string;
  deletedAt: Date | null;
  status: string;
}

/** In-memory stand-in for the few Prisma calls the trash methods make. `history` = product ids whose variants appear on orders/POs/transfers. */
function setup(rows: ProductRow[], history: string[] = [], failDeleteFor: string[] = []) {
  const products = new Map(rows.map((r) => [r.id, { ...r }]));
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const prisma = {
    product: {
      findMany: vi.fn(({ where }: { where: { id?: { in: string[] }; deletedAt: { not: null } } }) =>
        Promise.resolve(
          [...products.values()]
            .filter((p) => p.deletedAt !== null && (!where.id || where.id.in.includes(p.id)))
            .map((p) => ({ ...p, _count: { variants: 2 } })),
        ),
      ),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Partial<ProductRow> }) => {
        Object.assign(products.get(where.id)!, data);
        return Promise.resolve(products.get(where.id));
      }),
      delete: vi.fn(({ where }: { where: { id: string } }) => {
        if (failDeleteFor.includes(where.id)) return Promise.reject(new Error("Foreign key constraint violated"));
        products.delete(where.id);
        return Promise.resolve({});
      }),
    },
    productVariant: {
      findMany: vi.fn(({ where }: { where: { productId: { in: string[] } } }) =>
        Promise.resolve(where.productId.in.filter((id) => history.includes(id)).map((productId) => ({ productId }))),
      ),
    },
  };
  const service = new ProductsService(prisma as never, audit as never, {} as never);
  return { service, products, audit };
}

const trashed = (id: string): ProductRow => ({ id, title: { en: id }, slug: id, deletedAt: new Date("2026-11-17"), status: "archived" });
const live = (id: string): ProductRow => ({ id, title: { en: id }, slug: id, deletedAt: null, status: "active" });

describe("product trash", () => {
  it("lists only trashed products and flags the ones with order history", async () => {
    const { service } = setup([trashed("a"), trashed("b"), live("c")], ["b"]);
    const list = await service.listTrash();
    expect(list.map((p) => [p.id, p.hasOrderHistory])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });

  it("restores trashed products as drafts and ignores live ones", async () => {
    const { service, products, audit } = setup([trashed("a"), live("c")]);
    expect(await service.restoreMany(["a", "c"], actor)).toEqual({ restored: 1 });
    expect(products.get("a")).toMatchObject({ deletedAt: null, status: "draft" });
    expect(products.get("c")).toMatchObject({ status: "active" });
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it("purges only trashed products without history, and says why the rest were kept", async () => {
    const { service, products, audit } = setup([trashed("a"), trashed("ordered"), live("c")], ["ordered"]);
    const result = await service.purgeMany(["a", "ordered", "c"], actor);
    expect(result.deleted).toBe(1);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        { id: "c", reason: "not_in_trash" },
        { id: "ordered", reason: "has_order_history" },
      ]),
    );
    expect(products.has("a")).toBe(false);
    expect(products.has("ordered")).toBe(true);
    expect(products.has("c")).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "product.purge", entityId: "a" }));
  });

  it("reports a delete the database refuses instead of failing the whole batch", async () => {
    const { service } = setup([trashed("a"), trashed("b")], [], ["a"]);
    const result = await service.purgeMany(["a", "b"], actor);
    expect(result).toEqual({ deleted: 1, skipped: [{ id: "a", reason: "failed" }] });
  });
});
