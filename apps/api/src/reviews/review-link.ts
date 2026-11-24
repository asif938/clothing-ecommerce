import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, login-free review link for one order: `/review/<orderId>-<sig>`.
 * The separator is `-`, not `.`: the storefront's routing treats any path
 * with a dot as a static file. Order ids (cuid2) never contain `-`.
 * Most orders here are guest COD orders with no customer account, so the
 * review-request message can't send people to the account pages. The
 * signature (HMAC of the order id under a key derived from
 * `APP_ENCRYPTION_KEY`) is the whole credential: it only lets the holder
 * review that order's delivered items, once each — the same thing the
 * customer could do from their account. Stateless, so no new column.
 */
const SIG_LENGTH = 22;

function signature(orderId: string, encryptionKey: string): string {
  const key = createHmac("sha256", encryptionKey).update("order-review-link").digest();
  return createHmac("sha256", key).update(orderId).digest("base64url").slice(0, SIG_LENGTH);
}

export function signReviewToken(orderId: string, encryptionKey: string): string {
  return `${orderId}-${signature(orderId, encryptionKey)}`;
}

/** The order id a token was signed for, or null when it's malformed or the signature doesn't match. */
export function verifyReviewToken(token: string, encryptionKey: string): string | null {
  const separator = token.indexOf("-");
  if (separator <= 0) return null;
  const orderId = token.slice(0, separator);
  const given = Buffer.from(token.slice(separator + 1));
  const expected = Buffer.from(signature(orderId, encryptionKey));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return /^[a-z0-9]{10,40}$/.test(orderId) ? orderId : null;
}
