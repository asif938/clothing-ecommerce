import { createHmac } from "node:crypto";
import jwt from "jsonwebtoken";

export interface CustomerAccessTokenPayload {
  sub: string;
  phone: string | null;
}

/**
 * Customer access JWT (docs/PROJECT_SPEC.md §11.1/§6.13) — short-lived,
 * verified on every request with no DB round trip (unlike staff sessions,
 * which are opaque DB-backed tokens — customer-facing traffic is the
 * higher-volume path, so this trades a bit of revocability for speed; the
 * rotating refresh token is what's actually revocable, see
 * CustomerSessionService). Signed with a key derived from
 * `APP_ENCRYPTION_KEY` via HMAC rather than a separate `CUSTOMER_JWT_SECRET`
 * env var — one less required secret during setup, and the derivation
 * keeps the two key materials distinct (docs/DECISIONS.md).
 */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

function deriveJwtSecret(encryptionKey: string): string {
  return createHmac("sha256", encryptionKey).update("customer-access-jwt").digest("hex");
}

export function signCustomerAccessToken(payload: CustomerAccessTokenPayload, encryptionKey: string): string {
  return jwt.sign(payload, deriveJwtSecret(encryptionKey), { expiresIn: ACCESS_TOKEN_TTL_SECONDS, algorithm: "HS256" });
}

export function verifyCustomerAccessToken(token: string, encryptionKey: string): CustomerAccessTokenPayload | null {
  try {
    return jwt.verify(token, deriveJwtSecret(encryptionKey), { algorithms: ["HS256"] }) as CustomerAccessTokenPayload & jwt.JwtPayload;
  } catch {
    return null;
  }
}

export const ACCESS_TOKEN_TTL_MS = ACCESS_TOKEN_TTL_SECONDS * 1000;
