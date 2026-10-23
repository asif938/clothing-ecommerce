import { describe, expect, it, vi } from "vitest";
import { PagesService } from "./pages.service";

const actor = { id: "staff-1", isSuperAdmin: false } as never;

function makeService(pageOverrides: Record<string, unknown> = {}) {
  const page = {
    id: "p1",
    slug: "home",
    title: "Home",
    status: "draft",
    publishAt: null,
    blocksDraft: [{ id: "b1", type: "hero", props: { heading: { en: "Hi" } } }],
    blocksPublished: null,
    seoTitle: null,
    seoDescription: null,
    isSystem: false,
    lockedBy: null,
    lockedAt: null,
    deletedAt: null,
    ...pageOverrides,
  };
  const versions: Record<string, unknown>[] = [];

  const prisma = {
    page: {
      findUnique: vi.fn(() => Promise.resolve(page)),
      findMany: vi.fn(() => Promise.resolve([page])),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        Object.assign(page, data);
        return Promise.resolve(page);
      }),
      updateMany: vi.fn(({ where, data }: { where: { lockedBy?: string }; data: Record<string, unknown> }) => {
        if (page.lockedBy === where.lockedBy) Object.assign(page, data);
        return Promise.resolve({ count: 1 });
      }),
    },
    pageVersion: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const version = { id: `v${versions.length + 1}`, createdAt: new Date(), ...data };
        versions.push(version);
        return Promise.resolve(version);
      }),
      findUnique: vi.fn(({ where: { id } }: { where: { id: string } }) => Promise.resolve(versions.find((v) => v.id === id) ?? null)),
      findMany: vi.fn(() => Promise.resolve(versions)),
    },
  };
  const audit = { record: vi.fn() };
  const revalidation = { revalidate: vi.fn(() => Promise.resolve()) };
  const service = new PagesService(prisma as never, audit as never, revalidation as never);
  return { service, prisma, page, versions, audit, revalidation };
}

describe("PagesService.updateBlocks", () => {
  it("sanitizes a custom_html block's html on save (Super Admin only block type)", async () => {
    const { service, page } = makeService();
    const superAdmin = { id: "staff-1", isSuperAdmin: true } as never;

    await service.updateBlocks("p1", { blocks: [{ id: "b1", type: "custom_html", props: { html: '<p>hi</p><script>alert(1)</script>' } }] }, superAdmin);

    expect(page.blocksDraft).toEqual([{ id: "b1", type: "custom_html", props: { html: "<p>hi</p>" } }]);
  });

  it("rejects a custom_html block from a non-Super-Admin", async () => {
    const { service } = makeService();
    await expect(service.updateBlocks("p1", { blocks: [{ id: "b1", type: "custom_html", props: { html: "<p>hi</p>" } }] }, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "BLOCK_VALIDATION_ERROR" }),
    });
  });
});

describe("PagesService.publish", () => {
  it("copies the draft to blocksPublished, snapshots a version, and revalidates", async () => {
    const { service, page, revalidation } = makeService();
    await service.publish("p1", actor);

    expect(page.blocksPublished).toEqual(page.blocksDraft);
    expect(page.status).toBe("published");
    expect(revalidation.revalidate).toHaveBeenCalledWith(["page:home", "pages"]);
  });
});

describe("PagesService.restoreVersion", () => {
  it("restores into blocksDraft only — blocksPublished (the live site) is untouched", async () => {
    const { service, page, prisma } = makeService({ blocksPublished: [{ id: "old", type: "hero", props: {} }], status: "published" });
    const oldVersionBlocks = [{ id: "v-block", type: "rich_text", props: { content: { en: "old" } } }];
    const version = { id: "v1", pageId: "p1", blocks: oldVersionBlocks };
    prisma.pageVersion.findUnique = vi.fn(() => Promise.resolve(version));

    await service.restoreVersion("p1", "v1", actor);

    expect(page.blocksDraft).toEqual(oldVersionBlocks);
    expect(page.blocksPublished).toEqual([{ id: "old", type: "hero", props: {} }]);
    expect(page.status).toBe("published"); // restoring doesn't change publish status either
  });
});

describe("PagesService edit lock", () => {
  it("lets a second editor take over once the lock has expired", async () => {
    const staleTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago, past the 2-minute TTL
    const { service } = makeService({ lockedBy: "staff-2", lockedAt: staleTime });
    const result = await service.acquireLock("p1", actor);
    expect(result.locked).toBe(false);
  });

  it("blocks a second editor while the lock is fresh", async () => {
    const { service } = makeService({ lockedBy: "staff-2", lockedAt: new Date() });
    const result = await service.acquireLock("p1", actor);
    expect(result).toEqual({ locked: true, lockedBy: "staff-2" });
  });

  it("allows the same staff member to re-acquire their own lock", async () => {
    const { service } = makeService({ lockedBy: "staff-1", lockedAt: new Date() });
    const result = await service.acquireLock("p1", actor);
    expect(result.locked).toBe(false);
  });
});

describe("PagesService.runScheduledPublishSweep", () => {
  it("publishes a page whose publishAt has arrived", async () => {
    const { service, page, prisma } = makeService({ status: "scheduled", publishAt: new Date(Date.now() - 1000) });
    prisma.page.findMany = vi.fn(() => Promise.resolve([page]));

    await service.runScheduledPublishSweep();

    expect(page.status).toBe("published");
    expect(page.blocksPublished).toEqual(page.blocksDraft);
  });
});
