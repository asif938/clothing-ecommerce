import { describe, expect, it, vi } from "vitest";
import { Reflector } from "@nestjs/core";
import { ApiKeyGuard, API_SCOPES_METADATA_KEY } from "./api-key.guard";
import { ApiKeysService } from "./api-keys.service";
import { generateApiKey, hashApiKey } from "./api-key";

const actor = { id: "staff-1", name: "A", email: "a@x", locale: "en", permissions: new Set<string>(), isSuperAdmin: false, totpEnabled: true };

function makeService(stored: Record<string, unknown> | null = null) {
  const prisma = {
    apiKey: {
      create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: "k1", ...args.data })),
      findUnique: vi.fn(() => Promise.resolve(stored)),
      update: vi.fn(() => Promise.resolve({})),
      findMany: vi.fn(() => Promise.resolve([])),
    },
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  return { service: new ApiKeysService(prisma as never, audit as never), prisma, audit };
}

describe("ApiKeysService.create", () => {
  it("returns the plaintext once and stores only its hash", async () => {
    const { service, prisma, audit } = makeService();
    const result = await service.create({ name: "ERP", scopes: ["orders.read", "orders.read", "products.read"] }, actor);
    const stored = (prisma.apiKey.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(result.key).toMatch(/^ck_live_/);
    expect(stored.keyHash).toBe(hashApiKey(result.key));
    expect(JSON.stringify(stored)).not.toContain(result.key);
    expect(stored.scopes).toEqual(["orders.read", "products.read"]);
    // The audit trail never sees the key either.
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(result.key);
  });

  it("rejects unknown scopes, no scopes and a past expiry", async () => {
    const { service } = makeService();
    await expect(service.create({ name: "x", scopes: ["admin.everything"] }, actor)).rejects.toMatchObject({ response: { code: "SCOPE_UNKNOWN" } });
    await expect(service.create({ name: "x", scopes: [] }, actor)).rejects.toMatchObject({ response: { code: "SCOPE_REQUIRED" } });
    await expect(service.create({ name: "x", scopes: ["orders.read"], expiresAt: new Date("2020-01-01") }, actor)).rejects.toMatchObject({ response: { code: "EXPIRY_IN_PAST" } });
  });
});

describe("ApiKeysService.authenticate", () => {
  const { key, prefix, hash } = generateApiKey();
  const record = (over: Record<string, unknown> = {}) => ({ id: "k1", name: "ERP", prefix, keyHash: hash, scopes: ["orders.read"], expiresAt: null, revokedAt: null, lastUsedAt: new Date(), ...over });

  it("accepts the right key and returns its scopes", async () => {
    const { service } = makeService(record());
    expect(await service.authenticate(key)).toEqual({ id: "k1", name: "ERP", scopes: ["orders.read"] });
  });

  it("rejects a key with the right prefix but the wrong body", async () => {
    const { service } = makeService(record());
    expect(await service.authenticate(`${key.slice(0, -1)}${key.endsWith("A") ? "B" : "A"}`)).toBeNull();
  });

  it("rejects revoked, expired and unknown keys without touching last-used", async () => {
    for (const stored of [record({ revokedAt: new Date() }), record({ expiresAt: new Date("2020-01-01") }), null]) {
      const { service, prisma } = makeService(stored);
      expect(await service.authenticate(key)).toBeNull();
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
    }
  });

  it("stamps last-used only when it is stale", async () => {
    const fresh = makeService(record({ lastUsedAt: new Date() }));
    await fresh.service.authenticate(key);
    expect(fresh.prisma.apiKey.update).not.toHaveBeenCalled();
    const stale = makeService(record({ lastUsedAt: new Date(Date.now() - 3_600_000) }));
    await stale.service.authenticate(key);
    expect(stale.prisma.apiKey.update).toHaveBeenCalledTimes(1);
  });

  it("does not look anything up for something that is not shaped like a key", async () => {
    const { service, prisma } = makeService(record());
    expect(await service.authenticate("hello")).toBeNull();
    expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
  });
});

describe("ApiKeyGuard", () => {
  const { key } = generateApiKey();

  function makeGuard(opts: { enabled?: boolean; scopes?: string[]; auth?: { id: string; name: string; scopes: string[] } | null; limit?: number; required?: string[] } = {}) {
    const apiKeys = { authenticate: vi.fn(() => Promise.resolve(opts.auth === undefined ? { id: "k1", name: "ERP", scopes: opts.scopes ?? ["orders.read"] } : opts.auth)) };
    const settings = { getValue: vi.fn((k: string) => Promise.resolve(k === "publicApi.enabled" ? (opts.enabled ?? true) : (opts.limit ?? 2))) };
    const reflector = new Reflector();
    vi.spyOn(reflector, "getAllAndOverride").mockImplementation(((metaKey: string) => (metaKey === API_SCOPES_METADATA_KEY ? (opts.required ?? ["orders.read"]) : undefined)) as never);
    const guard = new ApiKeyGuard(reflector, apiKeys as never, settings as never);
    const headers: Record<string, string> = {};
    const request: Record<string, unknown> = { headers: { authorization: `Bearer ${key}` } };
    const response = { setHeader: vi.fn((name: string, value: string) => (headers[name] = value)) };
    const context = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) };
    return { guard, request, headers, context: context as never, apiKeys };
  }

  it("lets a valid key with the right scope through and attaches it to the request", async () => {
    const { guard, request, headers, context } = makeGuard();
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.apiKey).toMatchObject({ id: "k1" });
    expect(headers["X-RateLimit-Remaining"]).toBe("1");
  });

  it("is off until the setting is on", async () => {
    const { guard, context, apiKeys } = makeGuard({ enabled: false });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ response: { code: "PUBLIC_API_DISABLED" } });
    expect(apiKeys.authenticate).not.toHaveBeenCalled();
  });

  it("401s without a key or with a bad one", async () => {
    const missing = makeGuard();
    (missing.request as { headers: Record<string, string> }).headers = {};
    await expect(missing.guard.canActivate(missing.context)).rejects.toMatchObject({ response: { code: "API_KEY_REQUIRED" } });
    await expect(makeGuard({ auth: null }).guard.canActivate(makeGuard({ auth: null }).context)).rejects.toMatchObject({ response: { code: "API_KEY_INVALID" } });
  });

  it("403s a key that lacks the route's scope", async () => {
    const { guard, context } = makeGuard({ scopes: ["products.read"] });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ response: { code: "INSUFFICIENT_SCOPE" } });
  });

  it("429s over the per-minute limit and says when to retry", async () => {
    const { guard, context, headers } = makeGuard({ limit: 2 });
    await guard.canActivate(context);
    await guard.canActivate(context);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 429, response: { code: "RATE_LIMITED" } });
    expect(Number(headers["Retry-After"])).toBeGreaterThan(0);
  });
});
