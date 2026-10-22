import { generate } from "otplib";
import { describe, expect, it } from "vitest";
import { generateTotpSecret, generateTotpSetup, verifyTotpToken } from "./totp";

describe("TOTP", () => {
  it("verifies a token generated from the same secret", async () => {
    const secret = generateTotpSecret();
    const token = await generate({ secret });
    expect(await verifyTotpToken(secret, token)).toBe(true);
  });

  it("rejects a token generated from a different secret", async () => {
    const secret = generateTotpSecret();
    const otherToken = await generate({ secret: generateTotpSecret() });
    expect(await verifyTotpToken(secret, otherToken)).toBe(false);
  });

  it("rejects garbage input instead of throwing", async () => {
    const secret = generateTotpSecret();
    expect(await verifyTotpToken(secret, "not-a-valid-token")).toBe(false);
  });

  it("produces an otpauth URL and a data-URL QR code", async () => {
    const secret = generateTotpSecret();
    const { otpauthUrl, qrCodeDataUrl } = await generateTotpSetup(secret, "owner@example.com", "Demo Fashion");
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
