import { describe, expect, it, vi } from "vitest";
import { AiService } from "./ai.service";
import { AiDraftsService } from "./ai-drafts.service";

const actor = { id: "s1", name: "A", email: "a@x", locale: "en", permissions: new Set<string>(), isSuperAdmin: false, totpEnabled: true };

const config = { id: "cfg1", feature: "seo_meta", providerInstanceId: null, model: null, temperature: null, effort: null, maxTokens: 1000, promptTemplate: "Write meta for {product_title}", promptVersion: 1, enabled: true, monthlyBudgetCents: null as number | null, monthlyTokenBudget: null as number | null, alertedMonth: null };
const mockInstance = (id: string, simulate: "success" | "failure", priority = 0) => ({ id, name: id, capability: "ai", driver: "mock", enabled: true, isDefault: false, priority, config: { simulate } });

function make(opts: { instances?: ReturnType<typeof mockInstance>[]; settings?: Record<string, unknown>; spent?: number; cfg?: Partial<typeof config> } = {}) {
  const settingsMap: Record<string, unknown> = { "ai.enabled": true, "ai.fallbackToNextProvider": true, "ai.monthlyBudgetCents": null, "ai.budgetAlertPercent": 80, "brand.name": { en: "Demo" }, ...opts.settings };
  const prisma = {
    aiFeatureConfig: { findUnique: vi.fn(() => Promise.resolve({ ...config, ...opts.cfg })), updateMany: vi.fn(() => Promise.resolve({ count: 1 })) },
    providerInstance: { findMany: vi.fn(() => Promise.resolve(opts.instances ?? [mockInstance("p1", "success")])) },
    aiUsageLog: {
      aggregate: vi.fn(() => Promise.resolve({ _sum: { estCostMicroUsd: opts.spent ?? 0, inputTokens: 0, outputTokens: 0 }, _count: { _all: 0 } })),
      create: vi.fn((a: { data: object }) => Promise.resolve({ id: "log1", estCostMicroUsd: 0, ...a.data })),
    },
  };
  const settings = { getValue: vi.fn((key: string) => Promise.resolve(settingsMap[key])) };
  const registry = { decryptConfig: vi.fn((c: unknown) => c) };
  const staffNotifications = { notifyStaffWithPermission: vi.fn(() => Promise.resolve()) };
  const service = new AiService(prisma as never, settings as never, { record: vi.fn() } as never, registry as never, staffNotifications as never);
  return { service, prisma, staffNotifications };
}

describe("AiService.generate", () => {
  it("returns parsed output from the mock driver and logs usage", async () => {
    const { service, prisma } = make();
    const result = await service.generate({ feature: "seo_meta", variables: { product_title: "Panjabi" }, actor });
    expect(result.output.seoTitle.en).toContain("[mock]");
    expect(prisma.aiUsageLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ feature: "seo_meta", driver: "mock", status: "succeeded", actorId: "s1" }) });
  });

  it("falls back to the next enabled provider when the first fails", async () => {
    const { service, prisma } = make({ instances: [mockInstance("bad", "failure", 10), mockInstance("good", "success")] });
    await expect(service.generate({ feature: "seo_meta", variables: {}, actor })).resolves.toBeTruthy();
    const statuses = prisma.aiUsageLog.create.mock.calls.map((c) => (c[0] as { data: { status: string; providerInstanceId: string } }).data);
    expect(statuses).toEqual([expect.objectContaining({ providerInstanceId: "bad", status: "failed" }), expect.objectContaining({ providerInstanceId: "good", status: "succeeded" })]);
  });

  it("does not fall back when the setting is off", async () => {
    const { service } = make({ instances: [mockInstance("bad", "failure", 10), mockInstance("good", "success")], settings: { "ai.fallbackToNextProvider": false } });
    await expect(service.generate({ feature: "seo_meta", variables: {}, actor })).rejects.toMatchObject({ response: { code: "AI_FAILED" } });
  });

  it("hard-stops when the feature budget is spent", async () => {
    const { service, prisma } = make({ cfg: { monthlyBudgetCents: 100 }, spent: 1_000_000 });
    await expect(service.generate({ feature: "seo_meta", variables: {}, actor })).rejects.toMatchObject({ status: 402 });
    expect(prisma.aiUsageLog.create).not.toHaveBeenCalled();
  });

  it("hard-stops on the store-wide budget too", async () => {
    const { service } = make({ settings: { "ai.monthlyBudgetCents": 50 }, spent: 500_000 });
    await expect(service.generate({ feature: "seo_meta", variables: {}, actor })).rejects.toMatchObject({ response: { code: "AI_BUDGET_EXCEEDED" } });
  });

  it("alerts once when crossing the alert threshold", async () => {
    const { service, staffNotifications } = make({ cfg: { monthlyBudgetCents: 100 }, spent: 850_000 });
    await service.generate({ feature: "seo_meta", variables: {}, actor });
    expect(staffNotifications.notifyStaffWithPermission).toHaveBeenCalledWith(expect.objectContaining({ type: "ai_budget", permission: "ai.manage" }));
  });

  it("refuses while AI is disabled or no provider is enabled", async () => {
    await expect(make({ settings: { "ai.enabled": false } }).service.generate({ feature: "seo_meta", variables: {}, actor })).rejects.toMatchObject({ response: { code: "AI_DISABLED" } });
    await expect(make({ instances: [] }).service.generate({ feature: "seo_meta", variables: {}, actor })).rejects.toMatchObject({ response: { code: "AI_NO_PROVIDER" } });
  });
});

describe("AiDraftsService.productPatch", () => {
  const service = new AiDraftsService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const product = { title: { bn: "পাঞ্জাবি" }, subtitle: null, shortDescription: null, description: { bn: "পুরনো", en: "Old" }, seoTitle: { en: "Keep" }, seoDescription: null, careInstructions: null, fabric: null };

  it("merges descriptions without dropping other locales", () => {
    expect(service.productPatch("product_description", { description: { bn: "নতুন", en: "New" } }, product as never)).toEqual({ description: { bn: "নতুন", en: "New" } });
  });

  it("writes only the target language for translations", () => {
    expect(service.productPatch("translation", { fields: { title: "Panjabi", description: "Soft cotton" } }, product as never, "bn_to_en")).toEqual({
      title: { bn: "পাঞ্জাবি", en: "Panjabi" },
      description: { bn: "পুরনো", en: "Soft cotton" },
    });
  });

  it("ignores unknown or empty translated fields", () => {
    expect(service.productPatch("translation", { fields: { slug: "x", title: "  " } }, product as never, "en_to_bn")).toEqual({});
  });
});
