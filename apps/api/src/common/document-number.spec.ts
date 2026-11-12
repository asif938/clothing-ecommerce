import { describe, expect, it, vi } from "vitest";
import { createWithDocumentNumber, nextDocumentNumber } from "./document-number";

const now = new Date("2026-11-12T20:00:00Z"); // already 13 Nov in Dhaka

describe("nextDocumentNumber", () => {
  it("starts each Dhaka day at 0001", () => {
    expect(nextDocumentNumber("PO", now, null)).toBe("PO-261113-0001");
  });
  it("continues the day's sequence", () => {
    expect(nextDocumentNumber("PO", now, "PO-261113-0041")).toBe("PO-261113-0042");
  });
  it("ignores a latest number from another day", () => {
    expect(nextDocumentNumber("PO", now, "PO-261112-0041")).toBe("PO-261113-0001");
  });
});

describe("createWithDocumentNumber", () => {
  it("retries on a unique collision", async () => {
    const create = vi
      .fn<(n: string) => Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }))
      .mockImplementation((n) => Promise.resolve(n));
    const result = await createWithDocumentNumber("TR", () => Promise.resolve(null), create);
    expect(create).toHaveBeenCalledTimes(2);
    expect(result).toMatch(/^TR-\d{6}-0001$/);
  });
  it("rethrows other errors", async () => {
    await expect(createWithDocumentNumber("TR", () => Promise.resolve(null), () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
  });
});
