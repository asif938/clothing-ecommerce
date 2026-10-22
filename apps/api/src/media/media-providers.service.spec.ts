import { describe, expect, it, vi } from "vitest";
import { MediaProvidersService } from "./media-providers.service";

function makeService(opts: { defaultProvider: string; fallbackEnabled: boolean; usedPercent?: number; cloudinaryConfig?: Record<string, unknown> }) {
  const envStorage = {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    signedUrl: vi.fn(),
    publicUrl: (key: string) => `http://api.test/media/${key}`,
  };
  const prisma = {
    providerInstance: {
      findUniqueOrThrow: vi.fn(() => Promise.resolve({ id: "inst-1", capability: "storage", driver: "cloudinary", config: "encrypted" })),
    },
    scheduledTask: { create: vi.fn() },
  };
  const settings = {
    getValue: vi.fn((key: string) => {
      if (key === "media.defaultProvider") return Promise.resolve(opts.defaultProvider);
      if (key === "media.fallbackToEnvOnProviderLimit") return Promise.resolve(opts.fallbackEnabled);
      throw new Error(`unexpected setting "${key}"`);
    }),
  };
  const registry = {
    decryptConfig: vi.fn(() => opts.cloudinaryConfig ?? { cloudName: "demo", apiKey: "k", apiSecret: "s", mock: true }),
    getUsage: vi.fn(() => Promise.resolve(opts.usedPercent !== undefined ? { usedPercent: opts.usedPercent } : null)),
  };
  const scheduler = { registerHandler: vi.fn() };

  const service = new MediaProvidersService(envStorage as never, "local", prisma as never, settings as never, registry as never, scheduler as never);
  service.onModuleInit();
  return { service, envStorage, prisma, registry, scheduler };
}

describe("MediaProvidersService.resolveActiveDriver", () => {
  it("uses the env driver when media.defaultProvider is \"env\"", async () => {
    const { service } = makeService({ defaultProvider: "env", fallbackEnabled: true });
    const { driver, fellBackFromProviderInstanceId } = await service.resolveActiveDriver();
    expect(driver.kind).toBe("local");
    expect(driver.providerInstanceId).toBeNull();
    expect(fellBackFromProviderInstanceId).toBeNull();
  });

  it("uses the configured provider instance when usage is comfortably below the fallback threshold", async () => {
    const { service } = makeService({ defaultProvider: "inst-1", fallbackEnabled: true, usedPercent: 10 });
    const { driver, fellBackFromProviderInstanceId } = await service.resolveActiveDriver();
    expect(driver.kind).toBe("cloudinary");
    expect(driver.providerInstanceId).toBe("inst-1");
    expect(fellBackFromProviderInstanceId).toBeNull();
  });

  it("falls back to env once usage crosses 95% and the fallback setting is on", async () => {
    const { service } = makeService({ defaultProvider: "inst-1", fallbackEnabled: true, usedPercent: 96 });
    const { driver, fellBackFromProviderInstanceId } = await service.resolveActiveDriver();
    expect(driver.kind).toBe("local");
    expect(fellBackFromProviderInstanceId).toBe("inst-1");
  });

  it("does not fall back when the fallback setting is off, even past the threshold", async () => {
    const { service } = makeService({ defaultProvider: "inst-1", fallbackEnabled: false, usedPercent: 99 });
    const { driver, fellBackFromProviderInstanceId } = await service.resolveActiveDriver();
    expect(driver.kind).toBe("cloudinary");
    expect(fellBackFromProviderInstanceId).toBeNull();
  });

  it("proceeds without fallback if the usage check itself throws", async () => {
    const { service, registry } = makeService({ defaultProvider: "inst-1", fallbackEnabled: true });
    registry.getUsage.mockRejectedValueOnce(new Error("network down"));
    const { driver } = await service.resolveActiveDriver();
    expect(driver.kind).toBe("cloudinary");
  });
});

describe("MediaProvidersService.deleteAssetWithRetry", () => {
  it("schedules a retry task when the driver's delete throws", async () => {
    const { service, prisma } = makeService({ defaultProvider: "env", fallbackEnabled: false });
    const driver = service.envDriver();
    const failingStorage = { ...driver, delete: vi.fn(() => Promise.reject(new Error("boom"))) };
    await service.deleteAssetWithRetry(failingStorage as never, { storageKey: "media/x/original", externalId: null, resourceType: "image", variants: null });

    expect(prisma.scheduledTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "media.remote_delete_retry",
          payload: expect.objectContaining({ storageKey: "media/x/original", storageDriver: "local" }),
        }),
      }),
    );
  });

  it("does not schedule a retry when delete succeeds", async () => {
    const { service, prisma } = makeService({ defaultProvider: "env", fallbackEnabled: false });
    const driver = service.envDriver();
    await service.deleteAssetWithRetry(driver, { storageKey: "media/x/original", externalId: null, resourceType: "image", variants: null });
    expect(prisma.scheduledTask.create).not.toHaveBeenCalled();
  });
});
