import { describe, expect, it, vi } from "vitest";
import "@clothing/shared/settings";
import { BUNDLE_FORMAT } from "./bundle";
import { ConfigBundleService } from "./config-bundle.service";

const staff = (permissions: string[]) => ({ id: "staff-1", name: "A", email: "a@x", locale: "en", permissions: new Set(permissions), isSuperAdmin: false, totpEnabled: true });
const ctx = { ip: null, userAgent: null };
const bundle = (data: Record<string, unknown>, sections: string[]) => ({ format: BUNDLE_FORMAT, version: 1, sections, data });

function make() {
  const tx = {
    uiString: { findMany: vi.fn(() => Promise.resolve([{ key: "same", bn: "ক", en: "a" }])), upsert: vi.fn(() => Promise.resolve({})) },
    messageTemplate: { findMany: vi.fn(() => Promise.resolve([])), upsert: vi.fn(() => Promise.resolve({})) },
    category: {
      findMany: vi.fn(() => Promise.resolve([])),
      create: vi.fn((args: { data: { slug: string } }) => Promise.resolve({ id: `id-${args.data.slug}` })),
      update: vi.fn(() => Promise.resolve({})),
    },
    attribute: { findMany: vi.fn(() => Promise.resolve([])), create: vi.fn(() => Promise.resolve({ id: "a1" })), update: vi.fn() },
    attributeValue: { upsert: vi.fn(() => Promise.resolve({})) },
    page: {
      findMany: vi.fn(() => Promise.resolve([])),
      create: vi.fn(() => Promise.resolve({})),
      update: vi.fn(() => Promise.resolve({})),
    },
    menu: { findMany: vi.fn(() => Promise.resolve([])), create: vi.fn(() => Promise.resolve({})), update: vi.fn() },
    collection: { findMany: vi.fn(() => Promise.resolve([])) },
    product: { findMany: vi.fn(() => Promise.resolve([])) },
  };
  const prisma = { ...tx, $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const settings = { getValue: vi.fn(() => Promise.resolve("current")), setValue: vi.fn(() => Promise.resolve()) };
  const revalidation = { revalidate: vi.fn(() => Promise.resolve()) };
  return { service: new ConfigBundleService(prisma as never, audit as never, settings as never, revalidation as never), tx, prisma, audit, settings, revalidation };
}

describe("ConfigBundleService.import", () => {
  it("rejects something that is not a bundle", async () => {
    await expect(make().service.import({ hello: "world" }, { sections: ["settings"], dryRun: true, publishPages: false }, staff([]), ctx)).rejects.toMatchObject({ response: { code: "BUNDLE_INVALID" } });
  });

  it("a dry run reports changes but writes nothing and does not audit or revalidate", async () => {
    const { service, tx, prisma, audit, revalidation } = make();
    const report = await service.import(
      bundle({ uiStrings: [{ key: "same", bn: "ক", en: "a" }, { key: "new", bn: "খ", en: "b" }], categories: [{ slug: "men", parentSlug: null, name: { en: "Men" }, description: null, sortOrder: 0, isActive: true, seoTitle: null, seoDescription: null }] }, ["uiStrings", "categories"]),
      { sections: ["uiStrings", "categories"], dryRun: true, publishPages: false },
      staff([]),
      ctx,
    );
    expect(report.sections.uiStrings).toMatchObject({ created: 1, unchanged: 1, updated: 0 });
    expect(report.sections.categories).toMatchObject({ created: 1 });
    expect(tx.uiString.upsert).not.toHaveBeenCalled();
    expect(tx.category.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(revalidation.revalidate).not.toHaveBeenCalled();
  });

  it("applies in one transaction, creating parents before children, then audits and revalidates", async () => {
    const { service, tx, prisma, audit, revalidation } = make();
    const category = (slug: string, parentSlug: string | null) => ({ slug, parentSlug, name: { en: slug }, description: null, sortOrder: 0, isActive: true, seoTitle: null, seoDescription: null });
    const report = await service.import(bundle({ categories: [category("shirts", "men"), category("men", null)] }, ["categories"]), { sections: ["categories"], dryRun: false, publishPages: false }, staff([]), ctx);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.category.create.mock.calls.map((c) => (c[0] as { data: { slug: string; parentId: string | null } }).data)).toEqual([
      expect.objectContaining({ slug: "men", parentId: null }),
      expect.objectContaining({ slug: "shirts", parentId: "id-men" }),
    ]);
    expect(report.sections.categories).toMatchObject({ created: 2 });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "config_bundle.import" }));
    expect(revalidation.revalidate).toHaveBeenCalled();
  });

  it("skips categories whose parent is nowhere to be found", async () => {
    const { service, tx } = make();
    const report = await service.import(
      bundle({ categories: [{ slug: "orphan", parentSlug: "ghost", name: { en: "x" }, description: null, sortOrder: 0, isActive: true, seoTitle: null, seoDescription: null }] }, ["categories"]),
      { sections: ["categories"], dryRun: false, publishPages: false },
      staff([]),
      ctx,
    );
    expect(report.sections.categories!.skipped).toEqual([{ id: "orphan", reason: expect.stringContaining("ghost") }]);
    expect(tx.category.create).not.toHaveBeenCalled();
  });

  it("never imports secrets or unknown settings, and respects each setting's permission", async () => {
    const { service, settings } = make();
    const report = await service.import(
      bundle({ settings: { "no.such.setting": 1, "storeCredit.enabled": true, "giftCards.enabled": true } }, ["settings"]),
      { sections: ["settings"], dryRun: false, publishPages: false },
      staff(["settings.rewards.write"]),
      ctx,
    );
    // Both real settings need settings.rewards.write, which this staff member has; the unknown key is skipped.
    expect(report.sections.settings).toMatchObject({ updated: 2 });
    expect(report.sections.settings!.skipped).toEqual([{ id: "no.such.setting", reason: "Unknown setting" }]);
    expect(settings.setValue).toHaveBeenCalledTimes(2);

    const denied = make();
    const noPermission = await denied.service.import(bundle({ settings: { "storeCredit.enabled": true } }, ["settings"]), { sections: ["settings"], dryRun: false, publishPages: false }, staff([]), ctx);
    expect(noPermission.sections.settings!.skipped[0]!.reason).toContain("settings.rewards.write");
    expect(denied.settings.setValue).not.toHaveBeenCalled();
  });

  it("rejects an invalid setting value", async () => {
    const { service, settings } = make();
    const report = await service.import(bundle({ settings: { "storeCredit.enabled": "yes please" } }, ["settings"]), { sections: ["settings"], dryRun: false, publishPages: false }, staff(["settings.rewards.write"]), ctx);
    expect(report.sections.settings!.skipped).toHaveLength(1);
    expect(settings.setValue).not.toHaveBeenCalled();
  });

  it("brings pages in as drafts unless publishing is requested, and warns about embedded ids", async () => {
    const page = { slug: "about", title: "About", status: "published", blocksDraft: [{ props: { imageMediaId: "m1" } }], blocksPublished: [{ props: { imageMediaId: "m1" } }], seoTitle: null, seoDescription: null, noindex: false, isSystem: false, needsContent: false };

    const draft = make();
    const draftReport = await draft.service.import(bundle({ pages: [page] }, ["pages"]), { sections: ["pages"], dryRun: false, publishPages: false }, staff([]), ctx);
    expect(draft.tx.page.create).toHaveBeenCalledWith({ data: expect.objectContaining({ slug: "about", status: "draft" }) });
    expect((draft.tx.page.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data).not.toHaveProperty("blocksPublished");
    expect(draftReport.sections.pages!.warnings[0]).toContain("imageMediaId");

    const live = make();
    await live.service.import(bundle({ pages: [page] }, ["pages"]), { sections: ["pages"], dryRun: false, publishPages: true }, staff([]), ctx);
    expect(live.tx.page.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "published", blocksPublished: page.blocksPublished }) });
  });

  it("leaves a deleted page alone", async () => {
    const { service, tx } = make();
    tx.page.findMany.mockResolvedValueOnce([{ id: "p1", slug: "about", deletedAt: new Date() }] as never);
    const report = await service.import(
      bundle({ pages: [{ slug: "about", title: "About", status: "draft", blocksDraft: [], blocksPublished: null, seoTitle: null, seoDescription: null, noindex: false, isSystem: false, needsContent: false }] }, ["pages"]),
      { sections: ["pages"], dryRun: false, publishPages: false },
      staff([]),
      ctx,
    );
    expect(report.sections.pages!.skipped).toHaveLength(1);
    expect(tx.page.create).not.toHaveBeenCalled();
    expect(tx.page.update).not.toHaveBeenCalled();
  });

  it("warns about menu links that point at things missing on this deployment, but still imports the menu", async () => {
    const { service, tx } = make();
    const report = await service.import(
      bundle({ menus: [{ key: "header", name: "Header", items: [{ id: "1", type: "collection", targetSlug: "summer", label: { en: "Summer" } }, { id: "2", type: "url", url: "https://x.test", label: { en: "X" } }] }] }, ["menus"]),
      { sections: ["menus"], dryRun: false, publishPages: false },
      staff([]),
      ctx,
    );
    expect(report.sections.menus).toMatchObject({ created: 1 });
    expect(report.sections.menus!.warnings[0]).toContain("collection:summer");
    expect(tx.menu.create).toHaveBeenCalled();
  });
});
