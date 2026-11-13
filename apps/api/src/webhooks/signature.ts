import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Outbound webhook signing and retry policy (docs/PROJECT_SPEC.md §11.1,
 * §16 M17). The scheme follows the common "timestamp + body" HMAC pattern so
 * receivers can verify authenticity and reject replays:
 *
 *   X-Webhook-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>
 *
 * Pure functions, unit-tested (golden rule 10).
 */

export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export function generateWebhookSecret(random: Buffer = randomBytes(32)): string {
  return `whsec_${random.toString("base64url")}`;
}

export function signPayload(secret: string, timestampSeconds: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestampSeconds}.${body}`).digest("hex");
}

export function signatureHeader(secret: string, timestampSeconds: number, body: string): string {
  return `t=${timestampSeconds},v1=${signPayload(secret, timestampSeconds, body)}`;
}

/** What a receiver does: recompute the HMAC, compare in constant time, and refuse stale timestamps. */
export function verifySignature(secret: string, header: string, body: string, nowSeconds: number, toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!Number.isFinite(timestamp) || !signature || Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const expected = Buffer.from(signPayload(secret, timestamp, body), "hex");
  const given = Buffer.from(signature, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const BASE_DELAY_MS = 60_000;
const MAX_DELAY_MS = 6 * 60 * 60_000;

/** Delay before retry number `attempt` (1 = the retry after the first failure): 1m, 2m, 4m … capped at 6h. */
export function retryDelayMs(attempt: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1));
}

export type DeliveryOutcome = { status: "succeeded" } | { status: "pending"; nextAttemptAt: Date } | { status: "failed" };

/** Decides what happens to a delivery after an attempt. `attemptsMade` includes the attempt just finished. */
export function afterAttempt(ok: boolean, attemptsMade: number, maxAttempts: number, now: Date): DeliveryOutcome {
  if (ok) return { status: "succeeded" };
  if (attemptsMade >= maxAttempts) return { status: "failed" };
  return { status: "pending", nextAttemptAt: new Date(now.getTime() + retryDelayMs(attemptsMade)) };
}

/** 2xx counts as delivered; everything else (including 3xx — redirects are refused) is a failure to retry. */
export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

export function shouldAutoDisable(consecutiveFailures: number, threshold: number): boolean {
  return threshold > 0 && consecutiveFailures >= threshold;
}
