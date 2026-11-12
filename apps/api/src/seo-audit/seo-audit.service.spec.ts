import { describe, expect, it, vi } from "vitest";
import { SeoAuditService } from "./seo-audit.service";
import { blockText } from "./content-text";

describe("blockText", () => {
  it("collects localized strings from nested CMS blocks", () => {
    const blocks = [{ type: "hero", props: { title: { bn: "ঈদ", en: "Eid" }, cta: { label: { en: "Shop" } } } }, { type: "text", props: { body: { bn: "নতুন", en: "New" }, align: "left" } }];
    expect(blockText(blocks)).toEqual({ bn: "ঈদ নতুন", en: "Eid Shop New" });
  });
});

describe("SeoAuditService.internalProblem", () => {
  function make() {
    const prisma = {
      product: { findUnique: vi.fn(({ where }: { where: { slug: string } }) => Promise.resolve(where.slug === "live" ? { status: "active", deletedAt: null } : where.slug === "draft" ? { status: "draft", deletedAt: null } : null)) },
      category: { findUnique: vi.fn(() => Promise.resolve({ isActive: true, deletedAt: null })) },
      collection: { findUnique: vi.fn(() => Promise.resolve(null)) },
      page: { findUnique: vi.fn(() => Promise.resolve({ status: "published", deletedAt: null })) },
      blogPost: { findUnique: vi.fn(() => Promise.resolve(null)) },
      redirect: { findFirst: vi.fn(({ where }: { where: { fromPath: { in: string[] } } }) => Promise.resolve(where.fromPath.in.includes("/old-shirt") ? { toPath: "/p/live" } : where.fromPath.in.includes("/gone") ? { toPath: "/p/missing" } : null)) },
    };
    return new SeoAuditService(prisma as never, {} as never, {} as never);
  }

  it("resolves each route type against the catalog", async () => {
    const service = make();
    await expect(service.internalProblem("/p/live")).resolves.toBeNull();
    await expect(service.internalProblem("/en/p/draft")).resolves.toBe("product_not_active");
    await expect(service.internalProblem("/p/nope")).resolves.toBe("product_not_found");
    await expect(service.internalProblem("/c/men/panjabi")).resolves.toBeNull();
    await expect(service.internalProblem("/collections/eid")).resolves.toBe("collection_not_found");
    await expect(service.internalProblem("/pages/about")).resolves.toBeNull();
    await expect(service.internalProblem("/blog/x")).resolves.toBe("blog_post_not_found");
    await expect(service.internalProblem("/cart")).resolves.toBeNull();
  });

  it("follows one active redirect for unknown paths", async () => {
    const service = make();
    await expect(service.internalProblem("/old-shirt")).resolves.toBeNull();
    await expect(service.internalProblem("/en/old-shirt")).resolves.toBeNull();
    await expect(service.internalProblem("/gone")).resolves.toBe("product_not_found");
    await expect(service.internalProblem("/never-existed")).resolves.toBe("no_such_route");
  });
});
