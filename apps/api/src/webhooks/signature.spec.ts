import { describe, expect, it } from "vitest";
import { afterAttempt, generateWebhookSecret, isSuccessStatus, retryDelayMs, shouldAutoDisable, signPayload, signatureHeader, verifySignature } from "./signature";

const secret = "whsec_test";
const body = JSON.stringify({ id: "evt_1", event: "order.placed" });

describe("signing", () => {
  it("produces the documented header and verifies it", () => {
    const header = signatureHeader(secret, 1_700_000_000, body);
    expect(header).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
    expect(verifySignature(secret, header, body, 1_700_000_010)).toBe(true);
  });

  it("is independent of anything but secret, timestamp and body", () => {
    expect(signPayload(secret, 1, "x")).toBe(signPayload(secret, 1, "x"));
    expect(signPayload(secret, 1, "x")).not.toBe(signPayload(secret, 2, "x"));
    expect(signPayload(secret, 1, "x")).not.toBe(signPayload("other", 1, "x"));
  });

  it("rejects a tampered body, the wrong secret and a malformed header", () => {
    const header = signatureHeader(secret, 1_700_000_000, body);
    expect(verifySignature(secret, header, `${body} `, 1_700_000_000)).toBe(false);
    expect(verifySignature("whsec_other", header, body, 1_700_000_000)).toBe(false);
    expect(verifySignature(secret, "garbage", body, 1_700_000_000)).toBe(false);
    expect(verifySignature(secret, "t=1700000000", body, 1_700_000_000)).toBe(false);
    expect(verifySignature(secret, "t=1700000000,v1=zz", body, 1_700_000_000)).toBe(false);
  });

  it("rejects replays outside the tolerance window, in either direction", () => {
    const header = signatureHeader(secret, 1_700_000_000, body);
    expect(verifySignature(secret, header, body, 1_700_000_000 + 301)).toBe(false);
    expect(verifySignature(secret, header, body, 1_700_000_000 - 301)).toBe(false);
    expect(verifySignature(secret, header, body, 1_700_000_000 + 300)).toBe(true);
  });

  it("generates distinct secrets", () => {
    expect(generateWebhookSecret()).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(generateWebhookSecret()).not.toBe(generateWebhookSecret());
  });
});

describe("retry policy", () => {
  it("doubles from one minute and caps at six hours", () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([60_000, 120_000, 240_000, 480_000]);
    expect(retryDelayMs(20)).toBe(6 * 60 * 60_000);
  });

  it("decides each delivery's fate after an attempt", () => {
    const now = new Date("2026-11-13T00:00:00Z");
    expect(afterAttempt(true, 1, 6, now)).toEqual({ status: "succeeded" });
    expect(afterAttempt(false, 1, 6, now)).toEqual({ status: "pending", nextAttemptAt: new Date("2026-11-13T00:01:00Z") });
    expect(afterAttempt(false, 3, 6, now)).toEqual({ status: "pending", nextAttemptAt: new Date("2026-11-13T00:04:00Z") });
    expect(afterAttempt(false, 6, 6, now)).toEqual({ status: "failed" });
    expect(afterAttempt(false, 1, 1, now)).toEqual({ status: "failed" });
  });

  it("treats only 2xx as success", () => {
    expect([200, 204, 299].every(isSuccessStatus)).toBe(true);
    expect([199, 301, 400, 410, 500].some(isSuccessStatus)).toBe(false);
  });

  it("auto-disables at the threshold unless it is 0", () => {
    expect(shouldAutoDisable(19, 20)).toBe(false);
    expect(shouldAutoDisable(20, 20)).toBe(true);
    expect(shouldAutoDisable(500, 0)).toBe(false);
  });
});
