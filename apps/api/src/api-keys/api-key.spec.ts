import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter, extractApiKey, generateApiKey, hasScope, hashApiKey, hashesMatch, keyStatus, looksLikeApiKey } from "./api-key";

describe("generateApiKey", () => {
  it("makes a long unique key whose hash and prefix are derived from it", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).toMatch(/^ck_live_[A-Za-z0-9_-]{43}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.prefix).toBe(a.key.slice(0, 16));
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toContain(a.key.slice(8));
  });

  it("is deterministic for fixed randomness (so tests and rotations are reproducible)", () => {
    const buffer = Buffer.alloc(32, 7);
    expect(generateApiKey(buffer).key).toBe(generateApiKey(buffer).key);
  });
});

describe("hashesMatch", () => {
  it("compares digests exactly", () => {
    const { hash } = generateApiKey();
    expect(hashesMatch(hash, hash)).toBe(true);
    expect(hashesMatch(hash, hashApiKey("ck_live_other"))).toBe(false);
    expect(hashesMatch(hash, "")).toBe(false);
    expect(hashesMatch("", "")).toBe(false);
  });
});

describe("extractApiKey", () => {
  const { key } = generateApiKey();

  it("reads a bearer token or the X-API-Key header", () => {
    expect(extractApiKey({ authorization: `Bearer ${key}` })).toBe(key);
    expect(extractApiKey({ authorization: `bearer   ${key} ` })).toBe(key);
    expect(extractApiKey({ "x-api-key": key })).toBe(key);
  });

  it("ignores anything that does not look like one of our keys (staff cookies, JWTs, junk)", () => {
    expect(extractApiKey({})).toBeNull();
    expect(extractApiKey({ authorization: "Bearer eyJhbGciOi.payload.sig" })).toBeNull();
    expect(extractApiKey({ authorization: "Basic abc" })).toBeNull();
    expect(extractApiKey({ "x-api-key": "ck_live_short" })).toBeNull();
    expect(looksLikeApiKey(`ck_live_${"a".repeat(300)}`)).toBe(false);
  });
});

describe("hasScope", () => {
  it("needs every required scope", () => {
    expect(hasScope(["orders.read", "products.read"], ["orders.read"])).toBe(true);
    expect(hasScope(["orders.read"], ["orders.read", "products.read"])).toBe(false);
    expect(hasScope([], [])).toBe(true);
  });
});

describe("keyStatus", () => {
  const now = new Date("2026-11-13T00:00:00Z");
  it("reports revoked before expired before active", () => {
    expect(keyStatus({ revokedAt: now, expiresAt: new Date("2020-01-01") }, now)).toBe("revoked");
    expect(keyStatus({ revokedAt: null, expiresAt: new Date("2026-11-12") }, now)).toBe("expired");
    expect(keyStatus({ revokedAt: null, expiresAt: now }, now)).toBe("expired");
    expect(keyStatus({ revokedAt: null, expiresAt: new Date("2026-12-01") }, now)).toBe("active");
    expect(keyStatus({ revokedAt: null, expiresAt: null }, now)).toBe("active");
  });
});

describe("FixedWindowRateLimiter", () => {
  it("allows up to the limit per window, then blocks until the next window", () => {
    const limiter = new FixedWindowRateLimiter(60_000);
    const t = 1_000_000 * 60_000; // start of a window
    expect(limiter.hit("k", 2, t).allowed).toBe(true);
    expect(limiter.hit("k", 2, t + 1000)).toMatchObject({ allowed: true, remaining: 0 });
    const blocked = limiter.hit("k", 2, t + 30_000);
    expect(blocked).toMatchObject({ allowed: false, remaining: 0, retryAfterSeconds: 30 });
    expect(limiter.hit("k", 2, t + 60_000).allowed).toBe(true);
  });

  it("counts keys independently", () => {
    const limiter = new FixedWindowRateLimiter(60_000);
    limiter.hit("a", 1, 0);
    expect(limiter.hit("a", 1, 1).allowed).toBe(false);
    expect(limiter.hit("b", 1, 1).allowed).toBe(true);
  });
});
