import { describe, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { CatalogImportService } from "./catalog-import.service";
import { rowsToCsv } from "./workbook";

const OLD_HEADER = "sku,productSlug,productTitleEn,price,onHand\n";

function csv(header: string, rows: string[]): Buffer {
  return Buffer.from(header + rows.join("\n"));
}

/** A merchant-style template like docs' demo file: taka prices, option1/option2 slots, category paths, product fields on the first row only. */
const MERCHANT_HEADER =
  "﻿product_handle,title_bn,title_en,category_path,status,option1_name,option1_value,option2_name,option2_value,color_hex,variant_sku,price_bdt,compare_at_price_bdt,stock_qty,size_chart,fabric,fit,occasion,tags,description_en,care_instructions,images,is_featured\n";
const MERCHANT_ROWS = [
  "cotton-panjabi,কটন পাঞ্জাবি,Cotton Panjabi,Men > Panjabi,active,Size,M,Color,Navy,#1F2A44,PNJ-NAVY-M,\"2,450\",2950,12,Men Panjabi,Cotton,Regular,Eid;Festive,eid;new,Soft cotton.,ঠান্ডা পানিতে ধুয়ে নিন।,PNJ-NAVY-1.jpg;PNJ-NAVY-2.jpg,TRUE",
  "cotton-panjabi,,,,,,L,,Navy,#1F2A44,PNJ-NAVY-L,2450,2950,20,,,,,,,,,",
  "cotton-panjabi,,,,,,M,,Off White,#F2EDE4,PNJ-OWHT-M,2450,2950,8,,,,,,,,PNJ-OWHT-1.jpg;MISSING.jpg,",
];

type Row = Record<string, unknown> & { id: string };

function makeService(opts: { existingVariant?: Row | null } = {}) {
  const jobs = new Map<string, Row>();
  const files: Row[] = [];
  const categories: Row[] = [];
  const products: Row[] = [];
  const options: Row[] = [];
  const optionValues: Row[] = [];
  const variants: Row[] = opts.existingVariant ? [opts.existingVariant] : [];
  const productMedia: Row[] = [];
  const attributes: Row[] = [];
  const attributeValues: Row[] = [];
  const productAttributeValues: Row[] = [];
  const presets: Row[] = [];
  let seq = 0;
  const id = (prefix: string) => `${prefix}-${++seq}`;

  const prisma = {
    catalogImportJob: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const job = { id: id("job"), status: "pending", cursor: 0, processedRows: 0, createdRows: 0, updatedRows: 0, errorRows: 0, warningRows: 0, errorReport: null, ...data };
        jobs.set(job.id, job);
        return Promise.resolve(job);
      }),
      findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(jobs.get(where.id) ?? null)),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const job = { ...jobs.get(where.id)!, ...data };
        jobs.set(where.id, job);
        return Promise.resolve(job);
      }),
      updateMany: vi.fn(({ where, data }: { where: { id: string; cursor?: number }; data: Record<string, unknown> }) => {
        const current = jobs.get(where.id);
        if (!current || (where.cursor !== undefined && current.cursor !== where.cursor)) return Promise.resolve({ count: 0 });
        jobs.set(where.id, { ...current, ...data });
        return Promise.resolve({ count: 1 });
      }),
      findMany: vi.fn(() => Promise.resolve([...jobs.values()])),
    },
    catalogImportFile: {
      createMany: vi.fn(({ data }: { data: Record<string, unknown>[] }) => {
        for (const f of data) files.push({ id: id("file"), ...f });
        return Promise.resolve({ count: data.length });
      }),
      count: vi.fn(({ where }: { where: { jobId: string } }) => Promise.resolve(files.filter((f) => f.jobId === where.jobId).length)),
      findMany: vi.fn(({ where }: { where: { jobId: string } }) => Promise.resolve(files.filter((f) => f.jobId === where.jobId))),
      findUnique: vi.fn(({ where }: { where: { jobId_name: { jobId: string; name: string } } }) =>
        Promise.resolve(files.find((f) => f.jobId === where.jobId_name.jobId && f.name === where.jobId_name.name) ?? null),
      ),
      deleteMany: vi.fn(({ where }: { where: { jobId: string } }) => {
        for (let i = files.length - 1; i >= 0; i -= 1) if (files[i]!.jobId === where.jobId) files.splice(i, 1);
        return Promise.resolve({});
      }),
    },
    catalogImportPreset: {
      findMany: vi.fn(() => Promise.resolve(presets)),
      findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve(presets.find((p) => p.id === where.id) ?? null)),
      upsert: vi.fn(({ where, create }: { where: { name: string }; create: Record<string, unknown> }) => {
        const preset = { id: id("preset"), ...create, name: where.name };
        presets.push(preset);
        return Promise.resolve(preset);
      }),
      delete: vi.fn(() => Promise.resolve({})),
    },
    scheduledTask: { create: vi.fn() },
    category: {
      findUnique: vi.fn(({ where }: { where: { slug: string } }) => Promise.resolve(categories.find((c) => c.slug === where.slug) ?? null)),
      findMany: vi.fn(({ where }: { where: { parentId: string | null } }) => Promise.resolve(categories.filter((c) => c.parentId === where.parentId))),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const category = { id: id("cat"), ...data };
        categories.push(category);
        return Promise.resolve(category);
      }),
    },
    sizeChart: { findMany: vi.fn(() => Promise.resolve([])) },
    attribute: {
      findUnique: vi.fn(({ where }: { where: { code: string } }) => Promise.resolve(attributes.find((a) => a.code === where.code) ?? null)),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const attribute = { id: id("attr"), ...data };
        attributes.push(attribute);
        return Promise.resolve(attribute);
      }),
    },
    attributeValue: {
      findUnique: vi.fn(({ where }: { where: { attributeId_slug: { attributeId: string; slug: string } } }) =>
        Promise.resolve(attributeValues.find((v) => v.attributeId === where.attributeId_slug.attributeId && v.slug === where.attributeId_slug.slug) ?? null),
      ),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const value = { id: id("attrval"), ...data };
        attributeValues.push(value);
        return Promise.resolve(value);
      }),
    },
    productAttributeValue: {
      deleteMany: vi.fn(() => Promise.resolve({})),
      createMany: vi.fn(({ data }: { data: Record<string, unknown>[] }) => {
        for (const v of data) productAttributeValues.push({ id: id("pav"), ...v });
        return Promise.resolve({});
      }),
    },
    product: {
      findUnique: vi.fn(({ where }: { where: { slug: string } }) => Promise.resolve(products.find((p) => p.slug === where.slug) ?? null)),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const product = { id: id("prod"), ...data };
        products.push(product);
        return Promise.resolve(product);
      }),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const product = products.find((p) => p.id === where.id)!;
        Object.assign(product, data);
        return Promise.resolve(product);
      }),
    },
    productOption: {
      findMany: vi.fn(({ where }: { where: { productId: string } }) =>
        Promise.resolve(options.filter((o) => o.productId === where.productId).map((o) => ({ ...o, values: optionValues.filter((v) => v.productOptionId === o.id) }))),
      ),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const option = { id: id("opt"), ...data };
        options.push(option);
        return Promise.resolve(option);
      }),
    },
    productOptionValue: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const value = { id: id("val"), ...data };
        optionValues.push(value);
        return Promise.resolve(value);
      }),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const value = optionValues.find((v) => v.id === where.id)!;
        Object.assign(value, data);
        return Promise.resolve(value);
      }),
    },
    productVariant: {
      findUnique: vi.fn(({ where }: { where: { sku: string } }) => {
        const variant = variants.find((v) => v.sku === where.sku);
        return Promise.resolve(variant ? { ...variant, product: products.find((p) => p.id === variant.productId) ?? { slug: variant.productSlug } } : null);
      }),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const variant = { id: id("var"), ...data };
        variants.push(variant);
        return Promise.resolve(variant);
      }),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const variant = variants.find((v) => v.id === where.id)!;
        Object.assign(variant, data);
        return Promise.resolve(variant);
      }),
    },
    productMedia: {
      findMany: vi.fn(({ where }: { where: { productId: string } }) => Promise.resolve(productMedia.filter((m) => m.productId === where.productId).map((m) => ({ ...m, media: { originalName: m.originalName } })))),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const entry = { id: id("pm"), ...data };
        productMedia.push(entry);
        return Promise.resolve(entry);
      }),
      deleteMany: vi.fn(({ where }: { where: { productId: string } }) => {
        const before = productMedia.length;
        for (let i = productMedia.length - 1; i >= 0; i--) if (productMedia[i]!.productId === where.productId) productMedia.splice(i, 1);
        return Promise.resolve({ count: before - productMedia.length });
      }),
    },
    stockLocation: { findFirst: vi.fn(() => Promise.resolve(null)) },
    inventoryLevel: { findUnique: vi.fn(() => Promise.resolve(null)) },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  const audit = { record: vi.fn() };
  const scheduler = { registerHandler: vi.fn() };
  const inventory = { ensureLevelsForVariant: vi.fn(() => Promise.resolve()) };
  const uploadedNames: string[] = [];
  const media = {
    upload: vi.fn((file: { originalname: string }) => {
      uploadedNames.push(file.originalname);
      return Promise.resolve({ id: id("media") });
    }),
  };
  const mediaUsage = { sync: vi.fn() };

  // Give each uploaded media row's name back to `productMedia.findMany` (re-import dedupe reads `media.originalName`).
  prisma.productMedia.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
    const entry = { id: id("pm"), ...data, originalName: uploadedNames[uploadedNames.length - 1] };
    productMedia.push(entry);
    return Promise.resolve(entry);
  });

  const service = new CatalogImportService(prisma as never, audit as never, scheduler as never, inventory as never, media as never, mediaUsage as never);

  /** Runs every chunk of a job, as the scheduler would. */
  async function runJob(jobId: string) {
    for (let i = 0; i < 20 && jobs.get(jobId)!.status !== "done"; i += 1) {
      // @ts-expect-error -- private method, exercised directly (same pattern as MediaMigrationService's spec)
      await service.processChunk(jobId);
    }
    return jobs.get(jobId)!;
  }

  return { service, prisma, jobs, files, categories, products, options, optionValues, variants, productMedia, attributes, productAttributeValues, audit, media, runJob };
}

const actor = { id: "staff-1" } as never;

function zipOf(entries: Record<string, string>): Buffer {
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(entries).map(([name, content]) => [name, strToU8(content)]))));
}

describe("CatalogImportService.dryRun", () => {
  it("validates every row without touching the database, reporting both good and bad rows", () => {
    const { service, prisma } = makeService();
    const result = service.dryRun(csv(OLD_HEADER, ["A1,panjabi,Panjabi,150000,10", ",panjabi,Panjabi,150000,10"]), "products.csv");
    expect(result).toMatchObject({ totalRows: 2, validCount: 1, errorCount: 1 });
    expect(result.errors[0]).toMatchObject({ row: 3, level: "error" });
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it("auto-maps a merchant template and warns about images missing from the ZIP", () => {
    const { service } = makeService();
    const archive = zipOf({ "PNJ-NAVY-1.jpg": "x", "PNJ-NAVY-2.jpg": "x", "photos/PNJ-OWHT-1.jpg": "x" });
    const result = service.dryRun(csv(MERCHANT_HEADER, MERCHANT_ROWS), "demo.csv", undefined, undefined, archive);
    expect(result).toMatchObject({ totalRows: 3, validCount: 3, errorCount: 0, warningCount: 1, imageCount: 3 });
    expect(result.options).toEqual({ priceUnit: "bdt" });
    expect(result.errors).toEqual([expect.objectContaining({ row: 4, level: "warning", message: expect.stringContaining("MISSING.jpg") })]);
  });
});

describe("CatalogImportService — merchant template with a ZIP", () => {
  async function importDemo() {
    const ctx = makeService();
    const archive = zipOf({ "PNJ-NAVY-1.jpg": "a", "PNJ-NAVY-2.jpg": "b", "PNJ-OWHT-1.jpg": "c", "notes.txt": "skip me" });
    const result = await ctx.service.create({ buffer: csv(MERCHANT_HEADER, MERCHANT_ROWS), fileName: "demo.csv", archive }, actor);
    const job = await ctx.runJob(result.id);
    return { ...ctx, result, job };
  }

  it("stores only the ZIP's images and reports skipped entries", async () => {
    const { result } = await importDemo();
    expect(result.imageCount).toBe(3);
    expect(result.skippedImages).toEqual([expect.objectContaining({ name: "notes.txt" })]);
  });

  it("creates the category path, one product with localized fields, and taka prices stored as poisha", async () => {
    const { categories, products, variants, job } = await importDemo();
    expect(categories.map((c) => c.slug)).toEqual(["men", "men-panjabi"]);
    expect(categories[1]).toMatchObject({ parentId: categories[0]!.id, name: { en: "Panjabi" } });
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      slug: "cotton-panjabi",
      title: { bn: "কটন পাঞ্জাবি", en: "Cotton Panjabi" },
      categoryId: categories[1]!.id,
      status: "active",
      tags: ["eid", "new"],
      isFeatured: true,
      description: { en: "Soft cotton." },
      careInstructions: { bn: "ঠান্ডা পানিতে ধুয়ে নিন।" },
      fabric: { en: "Cotton" },
    });
    expect(products[0]!.publishedAt).toBeInstanceOf(Date);
    expect(variants.map((v) => [v.sku, v.price, v.compareAtPrice])).toEqual([
      ["PNJ-NAVY-M", 245000, 295000],
      ["PNJ-NAVY-L", 245000, 295000],
      ["PNJ-OWHT-M", 245000, 295000],
    ]);
    expect(job).toMatchObject({ status: "done", createdRows: 3, errorRows: 0 });
  });

  it("resolves unnamed continuation option slots by position and keeps the colour hex", async () => {
    const { options, optionValues, variants } = await importDemo();
    expect(options.map((o) => [o.name, o.type, o.position])).toEqual([
      [{ en: "Size" }, "size", 0],
      [{ en: "Color" }, "color", 1],
    ]);
    const navy = optionValues.find((v) => (v.value as { en: string }).en === "Navy")!;
    expect(navy.colorHex).toBe("#1F2A44");
    // Off White first appears on a continuation row (option names blank) — its hex must still land on the colour value.
    const offWhite = optionValues.find((v) => (v.value as { en: string }).en === "Off White")!;
    expect(offWhite.colorHex).toBe("#F2EDE4");
    expect(optionValues.filter((v) => v.colorHex).map((v) => (v.value as { en: string }).en)).toEqual(["Navy", "Off White"]);
    const sizeM = optionValues.find((v) => (v.value as { en: string }).en === "M")!;
    expect(variants[0]!.optionValueIds).toEqual([sizeM.id, navy.id]);
    // "M" is reused (not duplicated) by the Off White row.
    expect(optionValues.filter((v) => (v.value as { en: string }).en === "M")).toHaveLength(1);
  });

  it("creates fit/occasion attributes and links them", async () => {
    const { attributes, productAttributeValues } = await importDemo();
    expect(attributes.map((a) => [a.code, a.type])).toEqual([
      ["fit", "select"],
      ["occasion", "multiselect"],
    ]);
    expect(productAttributeValues).toHaveLength(3); // Regular + Eid + Festive
  });

  it("attaches ZIP images to the row's colour, warns for missing ones and size charts, and clears the scratch files", async () => {
    const { productMedia, optionValues, media, files, job } = await importDemo();
    expect(media.upload).toHaveBeenCalledTimes(3);
    const navy = optionValues.find((v) => (v.value as { en: string }).en === "Navy")!;
    const offWhite = optionValues.find((v) => (v.value as { en: string }).en === "Off White")!;
    expect(productMedia.map((m) => [m.optionValueId, m.position])).toEqual([
      [navy.id, 0],
      [navy.id, 1],
      [offWhite.id, 2],
    ]);
    const report = JSON.parse(job.errorReport as string) as { row: number; level: string; message: string }[];
    expect(report.every((issue) => issue.level === "warning")).toBe(true);
    expect(report.map((issue) => issue.message).join(" ")).toMatch(/Size chart "Men Panjabi" not found/);
    expect(report.map((issue) => issue.message).join(" ")).toMatch(/MISSING\.jpg" is not in the uploaded ZIP/);
    expect(job.warningRows).toBe(2);
    expect(files).toHaveLength(0);
  });

  it("does not upload the same image twice when the file is imported again", async () => {
    const ctx = makeService();
    const archive = zipOf({ "PNJ-NAVY-1.jpg": "a", "PNJ-NAVY-2.jpg": "b", "PNJ-OWHT-1.jpg": "c" });
    for (let i = 0; i < 2; i += 1) {
      const { id } = await ctx.service.create({ buffer: csv(MERCHANT_HEADER, MERCHANT_ROWS), fileName: "demo.csv", archive }, actor);
      await ctx.runJob(id);
    }
    expect(ctx.media.upload).toHaveBeenCalledTimes(3);
    expect(ctx.variants).toHaveLength(3);
  });
});

describe("CatalogImportService — other cases", () => {
  it("matches ZIP images by SKU prefix when the sheet has no images column", async () => {
    const { service, runJob, productMedia, media } = makeService();
    const archive = zipOf({ "A1.jpg": "x", "A1-2.jpg": "y", "A10.jpg": "z" });
    const { id } = await service.create({ buffer: csv(OLD_HEADER, ["A1,panjabi,Panjabi,150000,10"]), fileName: "p.csv", archive }, actor);
    await runJob(id);
    expect(media.upload.mock.calls.map(([file]) => (file as { originalname: string }).originalname)).toEqual(["a1-2.jpg", "a1.jpg"]);
    expect(productMedia).toHaveLength(2);
  });

  it("fails an option value with no option name and no earlier row to inherit it from", async () => {
    const { service, runJob } = makeService();
    const header = "sku,productSlug,option1_value,price\n";
    const { id } = await service.create({ buffer: csv(header, ["A1,p,M,1000"]), fileName: "p.csv" }, actor);
    const job = await runJob(id);
    expect(job.errorRows).toBe(1);
    expect(job.errorReport).toMatch(/no option name/);
  });

  it("refuses a SKU that belongs to another product before writing anything", async () => {
    const { service, runJob, products } = makeService({ existingVariant: { id: "var-x", sku: "A1", productId: "other", productSlug: "shirt" } });
    const { id } = await service.create({ buffer: csv(OLD_HEADER, ["A1,panjabi,Panjabi,150000,10"]), fileName: "p.csv" }, actor);
    const job = await runJob(id);
    expect(job.errorReport).toMatch(/already belongs to a different product/);
    expect(products).toHaveLength(0);
  });

  it("keeps the original fixed template working: poisha prices, product + variant created", async () => {
    const { service, runJob, variants } = makeService();
    const { id } = await service.create({ buffer: csv(OLD_HEADER, ["A1,panjabi,Panjabi,150000,10"]), fileName: "products.csv" }, actor);
    const job = await runJob(id);
    expect(variants[0]).toMatchObject({ sku: "A1", price: 150000 });
    expect(job).toMatchObject({ status: "done", createdRows: 1, errorRows: 0 });
  });

  it("updates an existing variant instead of creating a duplicate", async () => {
    const ctx = makeService();
    const first = await ctx.service.create({ buffer: csv(OLD_HEADER, ["A1,panjabi,Panjabi,100000,10"]), fileName: "p.csv" }, actor);
    await ctx.runJob(first.id);
    const second = await ctx.service.create({ buffer: csv(OLD_HEADER, ["A1,panjabi,Panjabi,150000,10"]), fileName: "p.csv" }, actor);
    const job = await ctx.runJob(second.id);
    expect(ctx.variants).toHaveLength(1);
    expect(ctx.variants[0]!.price).toBe(150000);
    expect(job).toMatchObject({ updatedRows: 1, createdRows: 0 });
  });

  it("brings back a product that was deleted in the admin when the same slug is imported again", async () => {
    const ctx = makeService();
    const first = await ctx.service.create({ buffer: csv(OLD_HEADER, ["A1,panjabi,Panjabi,100000,10"]), fileName: "p.csv" }, actor);
    await ctx.runJob(first.id);
    Object.assign(ctx.products[0]!, { deletedAt: new Date(), status: "archived" });

    const second = await ctx.service.create({ buffer: csv(OLD_HEADER, ["A1,panjabi,Panjabi,150000,10"]), fileName: "p.csv" }, actor);
    await ctx.runJob(second.id);

    expect(ctx.products).toHaveLength(1);
    expect(ctx.products[0]).toMatchObject({ deletedAt: null, status: "draft" });
  });

  it("drops a revived product's old gallery so the import uploads its images again", async () => {
    const ctx = makeService();
    const first = await ctx.service.create({ buffer: csv(OLD_HEADER, ["A1,panjabi,Panjabi,100000,10"]), fileName: "p.csv" }, actor);
    await ctx.runJob(first.id);
    const productId = ctx.products[0]!.id as string;
    ctx.productMedia.push({ id: "pm-old", productId, mediaId: "m-old", originalName: "a1.jpg" });
    Object.assign(ctx.products[0]!, { deletedAt: new Date(), status: "archived" });

    const second = await ctx.service.create({ buffer: csv(OLD_HEADER, ["A1,panjabi,Panjabi,150000,10"]), fileName: "p.csv" }, actor);
    await ctx.runJob(second.id);

    expect(ctx.productMedia.filter((m) => m.productId === productId && m.id === "pm-old")).toHaveLength(0);
  });

  it("keeps the gallery of a live product that is simply re-imported", async () => {
    const ctx = makeService();
    const first = await ctx.service.create({ buffer: csv(OLD_HEADER, ["A1,panjabi,Panjabi,100000,10"]), fileName: "p.csv" }, actor);
    await ctx.runJob(first.id);
    const productId = ctx.products[0]!.id as string;
    ctx.productMedia.push({ id: "pm-keep", productId, mediaId: "m-keep", originalName: "a1.jpg" });

    const second = await ctx.service.create({ buffer: csv(OLD_HEADER, ["A1,panjabi,Panjabi,150000,10"]), fileName: "p.csv" }, actor);
    await ctx.runJob(second.id);

    expect(ctx.productMedia.some((m) => m.id === "pm-keep")).toBe(true);
  });

  it("applies an explicit staff mapping and price unit over the auto-suggestion", async () => {
    const { service, runJob, variants } = makeService();
    const header = "Code,Group,Selling Price\n";
    const { id } = await service.create(
      { buffer: csv(header, ["Z9,saree,1850"]), fileName: "s.csv", mapping: { Code: "sku", Group: "productSlug", "Selling Price": "price" }, options: { priceUnit: "bdt" } },
      actor,
    );
    await runJob(id);
    expect(variants[0]).toMatchObject({ sku: "Z9", price: 185000 });
  });

  it("discards a chunk that finishes after another run already advanced the job (no rewind, no second chain)", async () => {
    const { service, prisma, jobs } = makeService();
    const rows = Array.from({ length: 25 }, (_, i) => `S${i},p${i},P,1000,1`);
    const { id } = await service.create({ buffer: csv(OLD_HEADER, rows), fileName: "p.csv" }, actor);
    // Two runs of the same chunk at once — e.g. a hung run and its stale-task re-run.
    await Promise.all([
      // @ts-expect-error -- private method
      service.processChunk(id),
      // @ts-expect-error -- private method
      service.processChunk(id),
    ]);
    expect(jobs.get(id)!.cursor).toBe(20);
    // One task from create() + exactly one next-chunk task.
    expect(prisma.scheduledTask.create).toHaveBeenCalledTimes(2);
  });

  it("rejects a corrupt ZIP up front", async () => {
    const { service } = makeService();
    await expect(service.create({ buffer: csv(OLD_HEADER, ["A1,p,P,1,1"]), fileName: "p.csv", archive: Buffer.from("not a zip") }, actor)).rejects.toMatchObject({ response: { code: "INVALID_ARCHIVE" } });
  });

  it("saves and deletes mapping presets with an audit entry each", async () => {
    const { service, audit } = makeService();
    const preset = await service.savePreset("Demo template", { variant_sku: "sku", bogus: "notAField" }, { priceUnit: "bdt" }, actor);
    expect(preset.mapping).toEqual({ variant_sku: "sku", bogus: null });
    await service.deletePreset(preset.id, actor);
    expect(audit.record.mock.calls.map(([entry]) => (entry as { action: string }).action)).toEqual(["catalog_import_preset.save", "catalog_import_preset.delete"]);
  });
});

describe("CatalogImportService.inspect", () => {
  it("returns headers (BOM stripped), samples and the suggested mapping", () => {
    const { service } = makeService();
    const result = service.inspect(csv(MERCHANT_HEADER, MERCHANT_ROWS), "demo.csv");
    expect(result.headers[0]).toBe("product_handle");
    expect(result.suggestedMapping).toMatchObject({ product_handle: "productSlug", variant_sku: "sku", price_bdt: "price", images: "images" });
    expect(result.suggestedOptions).toEqual({ priceUnit: "bdt" });
    expect(result.totalRows).toBe(3);
  });
});

describe("CatalogImportService.downloadErrorReport", () => {
  it("renders the stored JSON issue list as CSV, including the level", async () => {
    const { service, jobs } = makeService();
    jobs.set("job-x", { id: "job-x", errorReport: JSON.stringify([{ row: 2, sku: "A1", message: "price must not be negative", level: "error" }]) });
    const out = await service.downloadErrorReport("job-x");
    expect(out).toContain("A1");
    expect(out).toContain("error");
    expect(out).toContain("price must not be negative");
  });
});

describe("rowsToCsv", () => {
  it("round-trips simple rows", () => {
    expect(rowsToCsv([{ a: 1, b: "x" }])).toContain("a,b");
  });
});
