import { describe, expect, it, vi } from "vitest";
import { assignVariant } from "@clothing/shared/personalization";
import { CacheService } from "../cache/cache.service";
import { DiscountsService } from "../discounts/discounts.service";
import { ExperimentAssignmentsService } from "./experiment-assignments.service";
import { ExperimentsService } from "./experiments.service";

function settingsWith(values: Record<string, unknown>) {
  return { getValue: vi.fn((key: string) => Promise.resolve(values[key])) };
}

const offerExperiment = {
  id: "exp_offer",
  status: "running",
  kind: "offer",
  goal: "purchase",
  trafficPercent: 100,
  variants: [
    { key: "control", name: "No offer", weight: 50, payload: { discountId: null } },
    { key: "ten", name: "10% off", weight: 50, payload: { discountId: "disc_10" } },
  ],
  target: null,
  startedAt: new Date("2026-11-01T00:00:00Z"),
};

const blockExperiment = {
  id: "exp_block",
  status: "running",
  kind: "block",
  goal: "click",
  trafficPercent: 100,
  variants: [
    { key: "control", name: "Current", weight: 50 },
    { key: "b", name: "New headline", weight: 50, payload: { props: { title: { en: "New" } } } },
  ],
  target: { pageId: "page_home", blockId: "blk_hero" },
  startedAt: new Date("2026-11-01T00:00:00Z"),
};

function visitorIn(experiment: { id: string; trafficPercent: number; variants: { key: string; weight: number }[] }, key: string): string {
  for (let i = 0; i < 1000; i++) if (assignVariant(experiment, `visitor${i}`) === key) return `visitor${i}`;
  throw new Error("no visitor found");
}

function makeAssignments(rows: unknown[], settings: Record<string, unknown> = { "experiments.enabled": true }) {
  const prisma = {
    experiment: { findMany: vi.fn(() => Promise.resolve(rows)) },
    experimentExposure: {
      createMany: vi.fn(({ data }: { data: unknown[] }) => Promise.resolve({ count: data.length })),
      findMany: vi.fn(() => Promise.resolve([{ experimentId: "exp_block", variantKey: "b" }])),
    },
    experimentConversion: { createMany: vi.fn(({ data }: { data: unknown[] }) => Promise.resolve({ count: data.length })) },
    $executeRaw: vi.fn(() => Promise.resolve(3)),
  };
  return { prisma, service: new ExperimentAssignmentsService(prisma as never, settingsWith(settings) as never, new CacheService()) };
}

describe("ExperimentAssignmentsService", () => {
  it("gates offer discounts to the visitor's variant", async () => {
    const { service } = makeAssignments([offerExperiment]);
    const inTen = await service.offerGate(visitorIn(offerExperiment, "ten"));
    expect([...inTen.gated]).toEqual(["disc_10"]);
    expect(inTen.allowed.has("disc_10")).toBe(true);

    const inControl = await service.offerGate(visitorIn(offerExperiment, "control"));
    expect(inControl.allowed.has("disc_10")).toBe(false);
    // No cookie (e.g. an admin-created order) → control.
    expect((await service.offerGate(null)).allowed.size).toBe(0);
  });

  it("keeps gating a paused offer test and gives everyone the control", async () => {
    const { service } = makeAssignments([{ ...offerExperiment, status: "paused" }]);
    const gate = await service.offerGate(visitorIn(offerExperiment, "ten"));
    expect(gate.gated.has("disc_10")).toBe(true);
    expect(gate.allowed.has("disc_10")).toBe(false);
    // Paused tests split nobody.
    expect(await service.assignmentsFor("visitor1")).toEqual([]);
  });

  it("keeps gating with experiments switched off, and splits nobody", async () => {
    const { service } = makeAssignments([offerExperiment], { "experiments.enabled": false });
    const gate = await service.offerGate(visitorIn(offerExperiment, "ten"));
    expect(gate.gated.has("disc_10")).toBe(true);
    expect(gate.allowed.has("disc_10")).toBe(false);
    expect(await service.running()).toEqual([]);
  });

  it("returns assignments with payloads for announcement/offer and none for blocks", async () => {
    const { service } = makeAssignments([offerExperiment, blockExperiment]);
    const visitor = visitorIn(offerExperiment, "ten");
    const assignments = await service.assignmentsFor(visitor);
    const offer = assignments.find((a) => a.experimentId === "exp_offer")!;
    expect(offer).toMatchObject({ kind: "offer", variantKey: "ten", payload: { discountId: "disc_10" } });
    expect(assignments.find((a) => a.experimentId === "exp_block")!.payload).toBeNull();
  });

  it("records exposures with the server-computed variant, only for running experiments asked about", async () => {
    const { prisma, service } = makeAssignments([offerExperiment, blockExperiment]);
    const visitor = visitorIn(blockExperiment, "b");
    await service.recordExposures(visitor, ["exp_block", "exp_unknown"]);
    expect(prisma.experimentExposure.createMany).toHaveBeenCalledWith({ data: [{ experimentId: "exp_block", visitorId: visitor, variantKey: "b" }], skipDuplicates: true });
  });

  it("credits goals to the exposed variant only", async () => {
    const { prisma, service } = makeAssignments([blockExperiment]);
    await service.recordGoal("v1", "click", "exp_block");
    expect(prisma.experimentExposure.findMany).toHaveBeenCalledWith({ where: { visitorId: "v1", experimentId: { in: ["exp_block"] } }, select: { experimentId: true, variantKey: true } });
    expect(prisma.experimentConversion.createMany).toHaveBeenCalledWith({
      data: [{ experimentId: "exp_block", visitorId: "v1", variantKey: "b", goal: "click", reference: "", value: 0 }],
      skipDuplicates: true,
    });
  });

  it("attaches block variants to their page, control without props", async () => {
    const { service } = makeAssignments([blockExperiment]);
    const map = await service.blockExperimentsForPage("page_home");
    expect(map.get("blk_hero")).toEqual({
      experimentId: "exp_block",
      variants: [
        { key: "control", props: null },
        { key: "b", props: { title: { en: "New" } } },
      ],
    });
    expect((await service.blockExperimentsForPage("other")).size).toBe(0);
  });

  it("skips the conversion sweep when nothing is running", async () => {
    const { prisma, service } = makeAssignments([]);
    expect(await service.conversionSweep()).toBe(0);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});

const staff = { id: "staff_1", isSuperAdmin: false } as never;

function makeService(overrides: { experiment?: unknown; others?: unknown[]; page?: unknown } = {}) {
  const page = overrides.page ?? {
    id: "page_home",
    slug: "home",
    deletedAt: null,
    blocksPublished: [{ id: "blk_hero", type: "spacer", props: { height: "md" } }],
    blocksDraft: [{ id: "blk_hero", type: "spacer", props: { height: "md" } }],
  };
  const prisma = {
    experiment: {
      findUnique: vi.fn(() => Promise.resolve(overrides.experiment ?? null)),
      findMany: vi.fn(() => Promise.resolve(overrides.others ?? [])),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "exp_new", status: "draft", ...data })),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...(overrides.experiment as object), ...data })),
    },
    experimentExposure: { groupBy: vi.fn(() => Promise.resolve([])) },
    page: { findUnique: vi.fn(() => Promise.resolve(page)), update: vi.fn(() => Promise.resolve(page)) },
    announcementBar: { findUnique: vi.fn(() => Promise.resolve({ id: "bar_1" })) },
    discount: {
      count: vi.fn(({ where }: { where: { id: { in: string[] } } }) => Promise.resolve(where.id.in.length)),
      findUnique: vi.fn(({ where }: { where: { id: string } }) => Promise.resolve({ id: where.id, status: "active" })),
      update: vi.fn(({ where, data }: { where: { id: string }; data: object }) => Promise.resolve({ id: where.id, ...data })),
    },
    $queryRaw: vi.fn(() => Promise.resolve([])),
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const revalidation = { revalidate: vi.fn(() => Promise.resolve()) };
  const assignments = { invalidate: vi.fn() };
  const service = new ExperimentsService(
    prisma as never,
    audit as never,
    settingsWith({ "experiments.confidencePercent": 95, "experiments.minVisitorsPerVariant": 100 }) as never,
    revalidation as never,
    assignments as never,
  );
  return { prisma, audit, revalidation, assignments, service };
}

describe("ExperimentsService", () => {
  it("validates block variant props against the block's own schema", async () => {
    const { service, prisma } = makeService();
    await expect(
      service.create(
        {
          name: "Hero test",
          kind: "block",
          goal: "click",
          trafficPercent: 100,
          target: { pageId: "page_home", blockId: "blk_hero" },
          variants: [
            { key: "control", name: "A", weight: 50 },
            { key: "b", name: "B", weight: 50, payload: { props: { height: "huge" } } },
          ],
        },
        staff,
      ),
    ).rejects.toMatchObject({ response: { code: "INVALID_VARIANT_PROPS" } });

    await service.create(
      {
        name: "Hero test",
        kind: "block",
        goal: "click",
        trafficPercent: 100,
        target: { pageId: "page_home", blockId: "blk_hero" },
        variants: [
          { key: "control", name: "A", weight: 50, payload: { props: { ignored: true } } },
          { key: "b", name: "B", weight: 50, payload: { props: { height: "lg" } } },
        ],
      },
      staff,
    );
    const saved = prisma.experiment.create.mock.calls[0]![0].data.variants as { key: string; payload?: unknown }[];
    expect(saved[0]!.payload).toBeUndefined();
    expect(saved[1]!.payload).toEqual({ props: { height: "lg" } });
  });

  it("refuses a block that isn't on the published page", async () => {
    const { service } = makeService();
    await expect(
      service.create(
        {
          name: "x",
          kind: "block",
          goal: "click",
          trafficPercent: 100,
          target: { pageId: "page_home", blockId: "nope" },
          variants: [
            { key: "control", name: "A", weight: 50 },
            { key: "b", name: "B", weight: 50, payload: { props: { height: "lg" } } },
          ],
        },
        staff,
      ),
    ).rejects.toMatchObject({ response: { code: "INVALID_TARGET" } });
  });

  it("requires distinct discounts in an offer test", async () => {
    const { service } = makeService();
    await expect(
      service.create(
        {
          name: "Offer",
          kind: "offer",
          goal: "purchase",
          trafficPercent: 100,
          variants: [
            { key: "control", name: "A", weight: 50, payload: { discountId: "d1" } },
            { key: "b", name: "B", weight: 50, payload: { discountId: "d1" } },
          ],
        },
        staff,
      ),
    ).rejects.toMatchObject({ response: { code: "INVALID_VARIANTS" } });
  });

  it("won't start a second test on the same block", async () => {
    const draft = { ...blockExperiment, id: "exp_2", name: "Second", status: "draft", variants: [{ key: "control", name: "A", weight: 50 }, { key: "b", name: "B", weight: 50, payload: { props: { height: "lg" } } }] };
    const { service } = makeService({ experiment: draft, others: [{ ...blockExperiment, name: "First" }] });
    await expect(service.start("exp_2", staff)).rejects.toMatchObject({ response: { code: "TARGET_BUSY" } });
  });

  it("starts a draft, invalidates caches and revalidates the page", async () => {
    const draft = { ...blockExperiment, status: "draft", startedAt: null, variants: [{ key: "control", name: "A", weight: 50 }, { key: "b", name: "B", weight: 50, payload: { props: { height: "lg" } } }] };
    const { service, prisma, assignments, revalidation, audit } = makeService({ experiment: draft });
    await service.start("exp_block", staff);
    expect(prisma.experiment.update.mock.calls[0]![0].data).toMatchObject({ status: "running" });
    expect(assignments.invalidate).toHaveBeenCalled();
    expect(revalidation.revalidate).toHaveBeenCalledWith(["page:home", "pages"]);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "experiment.start" }));
  });

  it("freezes variants after start and only lets traffic go up", async () => {
    const { service } = makeService({ experiment: { ...blockExperiment, trafficPercent: 50 } });
    await expect(service.update("exp_block", { variants: blockExperiment.variants }, staff)).rejects.toMatchObject({ response: { code: "EXPERIMENT_STARTED" } });
    await expect(service.update("exp_block", { trafficPercent: 20 }, staff)).rejects.toMatchObject({ response: { code: "TRAFFIC_DECREASE" } });
    await expect(service.update("exp_block", { trafficPercent: 80 }, staff)).resolves.toMatchObject({ trafficPercent: 80 });
  });

  it("applying an offer winner disables the other variants' discounts", async () => {
    const { service, prisma } = makeService({ experiment: offerExperiment });
    const result = await service.complete("exp_offer", { winnerKey: "control", apply: true }, staff);
    expect(prisma.discount.update).toHaveBeenCalledWith({ where: { id: "disc_10" }, data: { status: "disabled" } });
    expect(result.applied).toContain("Disabled 1");
  });

  it("applying a block winner writes the page draft, not the published page", async () => {
    const running = { ...blockExperiment, variants: [{ key: "control", name: "A", weight: 50 }, { key: "b", name: "B", weight: 50, payload: { props: { height: "lg" } } }] };
    const { service, prisma } = makeService({ experiment: running });
    await service.complete("exp_block", { winnerKey: "b", apply: true }, staff);
    expect(prisma.page.update).toHaveBeenCalledWith({ where: { id: "page_home" }, data: { blocksDraft: [{ id: "blk_hero", type: "spacer", props: { height: "lg" } }] } });
  });

  it("summarises results on the experiment's goal with revenue as a secondary metric", async () => {
    const { service, prisma } = makeService({ experiment: { ...offerExperiment, goal: "purchase" } });
    prisma.experimentExposure.groupBy.mockResolvedValueOnce([
      { variantKey: "control", _count: { _all: 1000 } },
      { variantKey: "ten", _count: { _all: 1000 } },
    ] as never);
    prisma.$queryRaw.mockResolvedValueOnce([
      { variant_key: "control", goal: "purchase", visitors: 100, events: 110, value: 1_100_000n },
      { variant_key: "ten", goal: "purchase", visitors: 140, events: 150, value: 1_400_000n },
    ] as never);
    const results = await service.results("exp_offer");
    expect(results.summary.verdict).toBe("winner");
    expect(results.summary.winnerKey).toBe("ten");
    expect(results.secondary.find((s) => s.key === "ten")).toMatchObject({ orders: 150, buyers: 140, revenue: 1_400_000 });
    expect(results.visitorsNeededPerVariant).toBeGreaterThan(0);
  });
});

describe("DiscountsService with an offer experiment", () => {
  it("applies a test's automatic discount only to visitors in its variant", async () => {
    const { service: assignments } = makeAssignments([offerExperiment]);
    const discount = {
      id: "disc_10",
      type: "automatic",
      status: "active",
      startsAt: null,
      endsAt: null,
      valueType: "percent",
      value: 10,
      conditions: null,
      limits: null,
      combinableWith: null,
      usedCount: 0,
      marginGuardOverride: true,
    };
    const prisma = { discount: { findMany: vi.fn(() => Promise.resolve([discount])) } };
    const discounts = new DiscountsService(prisma as never, {} as never, settingsWith({ "checkout.maxCouponCodesPerOrder": 1 }) as never, assignments);
    const lines = [{ variantId: "v1", productId: "p1", categoryIds: [], tags: [], quantity: 1, lineTotal: 100_000, unitPrice: 100_000, costPrice: null }];
    const context = { subtotal: 100_000, totalQty: 1, isFirstOrder: false, channel: "web" };

    const inTen = await discounts.evaluate(lines, context, [], null, null, visitorIn(offerExperiment, "ten"));
    expect(inTen.totalDiscount).toBe(10_000);
    const inControl = await discounts.evaluate(lines, context, [], null, null, visitorIn(offerExperiment, "control"));
    expect(inControl.totalDiscount).toBe(0);
  });
});
