import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for secrets at rest (golden rule: settings/provider
 * config `secret` fields, docs/PROJECT_SPEC.md §4.1/§4.3). Node-only — do not
 * import this from client code; consume it from `apps/api` only.
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;

export interface EncryptedPayload {
  iv: string;
  tag: string;
  ciphertext: string;
}

/** `APP_ENCRYPTION_KEY` may be 64 hex chars or a base64 string — either must decode to exactly 32 bytes. */
export function resolveEncryptionKey(rawKey: string): Buffer {
  const trimmed = rawKey.trim();
  if (!trimmed) {
    throw new Error("APP_ENCRYPTION_KEY is not set");
  }
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const decoded = Buffer.from(trimmed, "base64");
  if (decoded.length === KEY_LENGTH_BYTES) {
    return decoded;
  }
  throw new Error("APP_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex chars, or base64)");
}

export function encrypt(plaintext: string, rawKey: string): EncryptedPayload {
  const key = resolveEncryptionKey(rawKey);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decrypt(payload: EncryptedPayload, rawKey: string): string {
  const key = resolveEncryptionKey(rawKey);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.iv === "string" && typeof v.tag === "string" && typeof v.ciphertext === "string";
}

/** Admin display for secrets: `••••1234`, per §4.1. */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return "••••";
  return `••••${plaintext.slice(-4)}`;
}
