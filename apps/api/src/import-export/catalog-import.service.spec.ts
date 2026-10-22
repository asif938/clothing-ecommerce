import { describe, expect, it, vi } from "vitest";
import { CatalogImportService } from "./catalog-import.service";
import { rowsToCsv } from "./workbook";

const CSV_HEADER = "sku,productSlug,productTitleEn,price,onHand\n";

function makeCsv(rows: string[]): Buffer {
  return Buffer.from(CSV_HEADER + rows.join("\n"));
}

function makeService(opts: { existingVariant?: Record<string, unknown> | null } = {}) {
  const jobs = new Map<string, Record<string, unknown>>();
  let jobSeq = 0;

  const prisma = {
    catalogImportJob: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const id = `job-${++jobSeq}`;
        const job = { id, status: "pending", cursor: 0, processedRows: 0, createdRows: 0, updatedRows: 0, errorRows: 0, errorReport: null, ...data };
        jobs.set(id, job);
        return Promise.resolve(job);
      }),
      findUnique: vi.fn(({ where: { id } }: { where: { id: string } }) => Promise.resolve(jobs.get(id) ?? null)),
      update: vi.fn(({ where: { id }, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const job = { ...(jobs.get(id) as Record<string, unknown>), ...data };
        jobs.set(id, job);
        return Promise.resolve(job);
      }),
      findMany: vi.fn(() => Promise.resolve([...jobs.values()])),
    },
    scheduledTask: { create: vi.fn() },
    category: { findUnique: vi.fn(() => Promise.resolve(null)) },
    product: {
      findUnique: vi.fn(() => Promise.resolve(null)),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "prod-1", ...data })),
    },
    productOption: { findFirst: vi.fn(() => Promise.resolve(null)), create: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "opt-1", ...data })) },
    productOptionValue: {
      findMany: vi.fn(() => Promise.resolve([])),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "val-1", ...data })),
    },
    productVariant: {
      findUnique: vi.fn(() => Promise.resolve(opts.existingVariant ?? null)),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "var-1", ...data })),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "var-1", ...data })),
    },
    stockLocation: { findFirst: vi.fn(() => Promise.resolve(null)) },
    inventoryLevel: { findUnique: vi.fn(() => Promise.resolve(null)) },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  const audit = { record: vi.fn() };
  const scheduler = { registerHandler: vi.fn() };
  const inventory = { ensureLevelsForVariant: vi.fn(() => Promise.resolve()) };

  const service = new CatalogImportService(prisma as never, audit as never, scheduler as never, inventory as never);
  return { service, prisma, jobs };
}

const actor = { id: "staff-1" } as never;

describe("CatalogImportService.dryRun", () => {
  it("validates every row without touching the database, reporting both good and bad rows", () => {
    const { service } = makeService();
    const buffer = makeCsv(["A1,panjabi,Panjabi,150000,10", ",panjabi,Panjabi,150000,10"]);
    const result = service.dryRun(buffer, "products.csv");
    expect(result).toMatchObject({ totalRows: 2, validCount: 1, errorCount: 1 });
    expect(result.errors[0]).toMatchObject({ row: 3 });
  });
});

describe("CatalogImportService chunk processing", () => {
  it("creates a job and processes it to completion, creating a new product+variant", async () => {
    const { service, prisma } = makeService();
    const buffer = makeCsv(["A1,panjabi,Panjabi,150000,10"]);

    const result = await service.create(buffer, "products.csv", actor);
    expect(result.totalRows).toBe(1);

    // @ts-expect-error -- private method, exercised directly (same pattern as MediaMigrationService's spec)
    await service.processChunk(result.id);

    expect(prisma.product.create).toHaveBeenCalledOnce();
    expect(prisma.productVariant.create).toHaveBeenCalledOnce();
    expect(prisma.catalogImportJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "done", createdRows: 1, errorRows: 0 }) }),
    );
  });

  it("records a validation failure in the error report without aborting the job", async () => {
    const { service, prisma } = makeService();
    const buffer = makeCsv([",panjabi,Panjabi,150000,10"]); // missing sku

    const result = await service.create(buffer, "products.csv", actor);
    // @ts-expect-error -- private method
    await service.processChunk(result.id);

    expect(prisma.catalogImportJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "done", errorRows: 1, createdRows: 0 }) }),
    );
  });

  it("updates an existing variant's price instead of creating a duplicate", async () => {
    const { service, prisma } = makeService({ existingVariant: { id: "var-1", productId: "prod-1", sku: "A1", price: 100000 } });
    prisma.product.findUnique.mockResolvedValueOnce({ id: "prod-1", slug: "panjabi" } as never);
    const buffer = makeCsv(["A1,panjabi,Panjabi,150000,10"]);

    const result = await service.create(buffer, "products.csv", actor);
    // @ts-expect-error -- private method
    await service.processChunk(result.id);

    expect(prisma.productVariant.create).not.toHaveBeenCalled();
    expect(prisma.productVariant.update).toHaveBeenCalledOnce();
    expect(prisma.catalogImportJob.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ updatedRows: 1 }) }));
  });
});

describe("CatalogImportService.downloadErrorReport", () => {
  it("renders the stored JSON error list as CSV", async () => {
    const { service, jobs } = makeService();
    jobs.set("job-x", { id: "job-x", errorReport: JSON.stringify([{ row: 2, sku: "A1", message: "price must not be negative" }]) });
    const csv = await service.downloadErrorReport("job-x");
    expect(csv).toContain("A1");
    expect(csv).toContain("price must not be negative");
  });
});

describe("rowsToCsv", () => {
  it("round-trips simple rows", () => {
    expect(rowsToCsv([{ a: 1, b: "x" }])).toContain("a,b");
  });
});
