import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * API key primitives (docs/PROJECT_SPEC.md §11.1 "API keys (phase 3)", §16
 * M17). A key looks like `ck_live_<43 url-safe chars>` (256 bits). Only its
 * SHA-256 hash is stored — keys are high-entropy random strings, so a fast
 * hash is the right tool (a slow password hash would only add latency to
 * every request). The first characters (`prefix`) are stored in the clear so
 * staff can recognise a key and the server can find the row to compare.
 */

export const API_KEY_PREFIX_LENGTH = 16;
const KEY_HEAD = "ck_live_";

export function generateApiKey(random: Buffer = randomBytes(32)): { key: string; prefix: string; hash: string } {
  const key = `${KEY_HEAD}${random.toString("base64url")}`;
  return { key, prefix: key.slice(0, API_KEY_PREFIX_LENGTH), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(KEY_HEAD) && value.length >= API_KEY_PREFIX_LENGTH + 20 && value.length <= 200;
}

/** Constant-time comparison of two hex digests. */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

/** Reads the key from `Authorization: Bearer …` or `X-API-Key`. Never from the query string — URLs end up in logs. */
export function extractApiKey(headers: Record<string, string | string[] | undefined>): string | null {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const auth = first(headers.authorization);
  const bearer = auth && /^Bearer\s+(.+)$/i.exec(auth.trim())?.[1]?.trim();
  const candidate = bearer || first(headers["x-api-key"])?.trim();
  return candidate && looksLikeApiKey(candidate) ? candidate : null;
}

export function hasScope(granted: readonly string[], required: readonly string[]): boolean {
  return required.every((scope) => granted.includes(scope));
}

export type KeyStatus = "active" | "revoked" | "expired";

export function keyStatus(key: { revokedAt: Date | null; expiresAt: Date | null }, now: Date): KeyStatus {
  if (key.revokedAt) return "revoked";
  if (key.expiresAt && key.expiresAt <= now) return "expired";
  return "active";
}

/** Fixed-window counter per key — enough to blunt a runaway integration; in-memory, so per API instance (fine for the single-instance free tier). */
export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, { windowStart: number; count: number }>();

  constructor(private readonly windowMs = 60_000) {}

  /** Records one request; returns whether it is within `limit`, and seconds until the window resets. */
  hit(id: string, limit: number, now: number): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const current = this.windows.get(id);
    const entry = current && current.windowStart === windowStart ? current : { windowStart, count: 0 };
    entry.count += 1;
    this.windows.set(id, entry);
    if (this.windows.size > 5000) this.prune(windowStart);
    return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), retryAfterSeconds: Math.ceil((windowStart + this.windowMs - now) / 1000) };
  }

  private prune(currentWindowStart: number) {
    for (const [id, entry] of this.windows) if (entry.windowStart < currentWindowStart) this.windows.delete(id);
  }
}
