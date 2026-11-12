import { describe, expect, it } from "vitest";
import { createMockAudienceDriver, googleUserIdentifiers, metaAudienceRows, sha256 } from "./audience.ts";

describe("audience identifier hashing", () => {
  it("hashes Meta rows as [phone digits, lowercased email] and skips empty members", () => {
    const rows = metaAudienceRows([{ phone: "+8801712345678", email: " Rahim@Example.COM " }, { phone: null, email: null }, { phone: "+8801812345678" }]);
    expect(rows).toEqual([
      [sha256("8801712345678"), sha256("rahim@example.com")],
      [sha256("8801812345678"), ""],
    ]);
  });

  it("hashes Google identifiers with the E.164 plus sign", () => {
    expect(googleUserIdentifiers({ phone: "+8801712345678", email: "a@b.com" })).toEqual([{ hashedPhoneNumber: sha256("+8801712345678") }, { hashedEmail: sha256("a@b.com") }]);
    expect(googleUserIdentifiers({})).toEqual([]);
  });

  it("mock driver creates stable ids and counts usable members", async () => {
    const driver = createMockAudienceDriver({ simulate: "success" });
    const id = await driver.ensureAudience("VIP", null);
    expect(await driver.ensureAudience("VIP", null)).toBe(id);
    expect(await driver.ensureAudience("VIP", "existing")).toBe("existing");
    expect(await driver.addMembers(id, [{ phone: "+880171" }, {}, { email: "x@y.z" }])).toEqual({ received: 2 });
  });
});
