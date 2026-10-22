import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, isEncryptedPayload, maskSecret, resolveEncryptionKey } from "./encryption";

const KEY_HEX = randomBytes(32).toString("hex");
const KEY_BASE64 = randomBytes(32).toString("base64");

describe("encrypt()/decrypt()", () => {
  it("round-trips plaintext with a hex key", () => {
    const payload = encrypt("sk_live_secret_value", KEY_HEX);
    expect(isEncryptedPayload(payload)).toBe(true);
    expect(decrypt(payload, KEY_HEX)).toBe("sk_live_secret_value");
  });

  it("round-trips plaintext with a base64 key", () => {
    const payload = encrypt("another secret", KEY_BASE64);
    expect(decrypt(payload, KEY_BASE64)).toBe("another secret");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encrypt("same input", KEY_HEX);
    const b = encrypt("same input", KEY_HEX);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("fails to decrypt with the wrong key", () => {
    const payload = encrypt("secret", KEY_HEX);
    const wrongKey = randomBytes(32).toString("hex");
    expect(() => decrypt(payload, wrongKey)).toThrow();
  });

  it("rejects a key that isn't exactly 32 bytes", () => {
    expect(() => resolveEncryptionKey("too-short")).toThrow();
  });

  it("rejects an empty key", () => {
    expect(() => resolveEncryptionKey("")).toThrow();
  });
});

describe("maskSecret()", () => {
  it("keeps only the last 4 characters", () => {
    expect(maskSecret("sk_live_1234")).toBe("••••1234");
  });

  it("fully masks very short secrets", () => {
    expect(maskSecret("abc")).toBe("••••");
  });
});
