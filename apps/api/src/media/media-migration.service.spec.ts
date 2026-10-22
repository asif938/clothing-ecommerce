import { describe, expect, it, vi } from "vitest";
import { MediaMigrationService } from "./media-migration.service";

function makeMedia(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    kind: "image",
    storageDriver: "local",
    storageKey: `media/${id}/original`,
    externalId: null,
    resourceType: "image",
    version: null,
    variants: { thumb: { key: `media/${id}/thumb.webp`, width: 200, height: 150 } },
    mimeType: "image/png",
    ...overrides,
  };
}

function makeService(mediaRows: ReturnType<typeof makeMedia>[]) {
  const jobs = new Map<string, Record<string, unknown>>();
  let jobSeq = 0;

  const prisma = {
    media: {
      count: vi.fn(() => Promise.resolve(mediaRows.length)),
      findMany: vi.fn(({ where, take }: { where: { id?: { gt?: string } }; take: number }) => {
        const start = where.id?.gt ? mediaRows.findIndex((m) => m.id === where.id!.gt) + 1 : 0;
        return Promise.resolve(mediaRows.slice(start, start + take));
      }),
      update: vi.fn(() => Promise.resolve({})),
    },
    providerInstance: { findUnique: vi.fn(() => Promise.resolve({ id: "inst-1", capability: "storage" })) },
    mediaMigrationJob: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const id = `job-${++jobSeq}`;
        const job = { id, status: "pending", processedCount: 0, failedCount: 0, cursor: null, lastError: null, ...data };
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
  };

  const envDriver = {
    kind: "local" as const,
    providerInstanceId: null,
    downloadOriginal: vi.fn(() => Promise.resolve(Buffer.from("bytes"))),
  };
  const cloudinaryDriver = {
    kind: "cloudinary" as const,
    providerInstanceId: "inst-1",
    upload: vi.fn(() => Promise.resolve({ storageKey: "media/x", externalId: "x", version: 1, width: 100, height: 100, variants: null, blurDataUrl: null })),
  };

  const providers = {
    resolveDriverForAsset: vi.fn(() => Promise.resolve(envDriver)),
    driverForProvider: vi.fn((toProvider: string) => Promise.resolve(toProvider === "env" ? envDriver : cloudinaryDriver)),
    deleteAssetWithRetry: vi.fn(() => Promise.resolve()),
  };
  const audit = { record: vi.fn() };
  const scheduler = { registerHandler: vi.fn() };

  const service = new MediaMigrationService(prisma as never, providers as never, audit as never, scheduler as never);
  return { service, prisma, providers, cloudinaryDriver, jobs };
}

describe("MediaMigrationService", () => {
  it("dry run reports the eligible count without creating a job", async () => {
    const { service, prisma } = makeService([makeMedia("m1")]);
    const result = await service.create({ toProvider: "inst-1", dryRun: true }, { id: "staff-1" } as never);
    expect(result).toEqual({ totalCount: 1 });
    expect(prisma.mediaMigrationJob.create).not.toHaveBeenCalled();
  });

  it("rejects a toProvider that isn't a known storage provider instance", async () => {
    const { service, prisma } = makeService([]);
    prisma.providerInstance.findUnique.mockResolvedValueOnce(null as never);
    await expect(service.create({ toProvider: "nope", dryRun: false }, { id: "staff-1" } as never)).rejects.toThrow();
  });

  it("processes a chunk, moves the asset, deletes the old copy, and marks the job done when nothing remains", async () => {
    const rows = [makeMedia("m1"), makeMedia("m2")];
    const { service, cloudinaryDriver, providers, prisma } = makeService(rows);

    const { job } = await service.create({ toProvider: "inst-1", dryRun: false }, { id: "staff-1" } as never);
    // @ts-expect-error -- private method, exercised directly to avoid depending on the scheduler's own tick timing
    await service.processChunk(job!.id);

    expect(cloudinaryDriver.upload).toHaveBeenCalledTimes(2);
    expect(providers.deleteAssetWithRetry).toHaveBeenCalledTimes(2);
    expect(prisma.mediaMigrationJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "done", processedCount: 2, failedCount: 0 }) }),
    );
  });

  it("resumes from the stored cursor on the next tick instead of restarting", async () => {
    const rows = [makeMedia("m1"), makeMedia("m2"), makeMedia("m3")];
    const { service, prisma } = makeService(rows);
    // Force a chunk size smaller than the dataset by monkey-patching findMany's take via the mock already honoring `take` — use 2 calls with take=20 so instead assert resumability via explicit cursor.
    const job = await prisma.mediaMigrationJob.create({ data: { toProvider: "inst-1", dryRun: false, totalCount: 3, createdBy: "staff-1" } });
    await prisma.mediaMigrationJob.update({ where: { id: job.id }, data: { cursor: "m1", processedCount: 1 } });

    // @ts-expect-error -- private method
    await service.processChunk(job.id);

    expect(prisma.media.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { gt: "m1" } }) }));
  });

  it("counts a failed upload without aborting the rest of the chunk", async () => {
    const rows = [makeMedia("m1"), makeMedia("m2")];
    const { service, cloudinaryDriver, prisma } = makeService(rows);
    cloudinaryDriver.upload.mockRejectedValueOnce(new Error("upload failed"));

    const { job } = await service.create({ toProvider: "inst-1", dryRun: false }, { id: "staff-1" } as never);
    // @ts-expect-error -- private method
    await service.processChunk(job!.id);

    expect(prisma.mediaMigrationJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processedCount: 1, failedCount: 1 }) }),
    );
  });
});
