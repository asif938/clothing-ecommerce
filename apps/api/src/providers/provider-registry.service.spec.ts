import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderRegistryService } from "./provider-registry.service";

const ENCRYPTION_KEY = randomBytes(32).toString("hex");

describe("ProviderRegistryService", () => {
  let root: string;
  let prisma: { providerInstance: { findUnique: ReturnType<typeof vi.fn> }; providerLog: { create: ReturnType<typeof vi.fn> } };
  let audit: { record: ReturnType<typeof vi.fn> };
  let cache: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; invalidateTag: ReturnType<typeof vi.fn> };
  let config: { getOrThrow: ReturnType<typeof vi.fn> };
  let service: ProviderRegistryService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "clothing-provider-test-"));
    prisma = { providerInstance: { findUnique: vi.fn() }, providerLog: { create: vi.fn() } };
    audit = { record: vi.fn() };
    cache = { get: vi.fn(() => undefined), set: vi.fn(), invalidateTag: vi.fn() };
    config = { getOrThrow: vi.fn(() => ENCRYPTION_KEY) };
    service = new ProviderRegistryService(prisma as never, audit as never, cache as never, config as never);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("round-trips config through encryptConfig/decryptConfig", () => {
    const encrypted = service.encryptConfig({ rootDir: root, publicBaseUrl: "http://localhost:4000/media" });
    expect(service.decryptConfig(encrypted)).toEqual({ rootDir: root, publicBaseUrl: "http://localhost:4000/media" });
  });

  it("validates config against the driver's own schema", () => {
    expect(() => service.validateConfig("storage", "local", { rootDir: root, publicBaseUrl: "http://x" })).not.toThrow();
    expect(() => service.validateConfig("storage", "local", { rootDir: 123 })).toThrow(BadRequestException);
  });

  it("rejects an unknown driver", () => {
    expect(() => service.validateConfig("storage", "nope", {})).toThrow(BadRequestException);
  });

  it("masks secret fields but leaves non-secret fields untouched", () => {
    const masked = service.maskConfigForDisplay("email", "smtp", {
      host: "smtp.example.com",
      port: 587,
      secure: false,
      username: "user",
      password: "super-secret-password",
      fromAddress: "a@b.com",
      fromName: "Shop",
    });
    expect(masked.host).toBe("smtp.example.com");
    expect(masked.password).toBe("••••word");
  });

  it("testConnection runs the real driver's test and logs the result", async () => {
    const config_ = { rootDir: root, publicBaseUrl: "http://localhost:4000/media" };
    prisma.providerInstance.findUnique.mockResolvedValue({
      id: "p1",
      capability: "storage",
      driver: "local",
      config: service.encryptConfig(config_),
    });

    const result = await service.testConnection("p1");
    expect(result.ok).toBe(true);
    expect(prisma.providerLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ providerInstanceId: "p1", status: "ok" }) }),
    );
  });

  it("getUsage returns null for a driver with no usage hook (local)", async () => {
    prisma.providerInstance.findUnique.mockResolvedValue({
      id: "p1",
      capability: "storage",
      driver: "local",
      config: service.encryptConfig({ rootDir: root, publicBaseUrl: "http://localhost:4000/media" }),
    });
    expect(await service.getUsage("p1")).toBeNull();
  });

  it("getUsage caches the result and audit-logs the first time a threshold is crossed", async () => {
    prisma.providerInstance.findUnique.mockResolvedValue({
      id: "p2",
      capability: "storage",
      driver: "cloudinary",
      config: service.encryptConfig({ cloudName: "demo", apiKey: "k", apiSecret: "s", mock: true }),
    });
    // Mock mode always reports 0% — exercise the "no threshold crossed" path, then the cache hit.
    const first = await service.getUsage("p2");
    expect(first).toEqual({ usedPercent: 0, details: { mock: true } });
    expect(cache.set).toHaveBeenCalledTimes(1);

    cache.get.mockReturnValueOnce({ usedPercent: 0, details: { mock: true } });
    await service.getUsage("p2");
    expect(prisma.providerInstance.findUnique).toHaveBeenCalledTimes(1); // the cached second call never re-fetches the instance
  });
});
