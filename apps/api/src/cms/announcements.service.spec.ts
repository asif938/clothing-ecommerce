import { describe, expect, it, vi } from "vitest";
import { AnnouncementsService } from "./announcements.service";

function makeService(bars: { id: string; isActive: boolean; startsAt: Date | null; endsAt: Date | null }[]) {
  const prisma = {
    announcementBar: {
      findMany: vi.fn(({ where }: { where?: { isActive?: boolean } } = {}) =>
        Promise.resolve(where?.isActive === undefined ? bars : bars.filter((bar) => bar.isActive === where.isActive)),
      ),
    },
  };
  const audit = { record: vi.fn() };
  const revalidation = { revalidate: vi.fn(() => Promise.resolve()) };
  return new AnnouncementsService(prisma as never, audit as never, revalidation as never);
}

describe("AnnouncementsService.listActiveNow", () => {
  it("includes a bar with no schedule at all", async () => {
    const service = makeService([{ id: "a1", isActive: true, startsAt: null, endsAt: null }]);
    expect(await service.listActiveNow()).toHaveLength(1);
  });

  it("excludes a bar before its startsAt — hasn't appeared yet", async () => {
    const future = new Date(Date.now() + 60_000);
    const service = makeService([{ id: "a1", isActive: true, startsAt: future, endsAt: null }]);
    expect(await service.listActiveNow()).toHaveLength(0);
  });

  it("includes a bar once startsAt has passed", async () => {
    const past = new Date(Date.now() - 60_000);
    const service = makeService([{ id: "a1", isActive: true, startsAt: past, endsAt: null }]);
    expect(await service.listActiveNow()).toHaveLength(1);
  });

  it("excludes a bar after its endsAt — has disappeared", async () => {
    const past = new Date(Date.now() - 60_000);
    const service = makeService([{ id: "a1", isActive: true, startsAt: null, endsAt: past }]);
    expect(await service.listActiveNow()).toHaveLength(0);
  });

  it("excludes a bar marked inactive regardless of schedule", async () => {
    const service = makeService([{ id: "a1", isActive: false, startsAt: null, endsAt: null }]);
    expect(await service.listActiveNow()).toHaveLength(0);
  });

  it("includes a bar strictly inside its start/end window", async () => {
    const service = makeService([{ id: "a1", isActive: true, startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 60_000) }]);
    expect(await service.listActiveNow()).toHaveLength(1);
  });
});
