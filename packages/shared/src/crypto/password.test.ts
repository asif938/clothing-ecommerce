import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword()/verifyPassword()", () => {
  it("verifies the correct password", async () => {
    const hashValue = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword(hashValue, "correct-horse-battery-staple")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hashValue = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword(hashValue, "wrong-password")).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });
});
