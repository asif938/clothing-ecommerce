import { describe, expect, it } from "vitest";
import { PendingLoginStore } from "./pending-login.store";

const config = (key: string) => ({ get: () => key });

describe("PendingLoginStore", () => {
  it("round-trips a ticket to its staff user, across instances (survives restarts)", () => {
    const ticket = new PendingLoginStore(config("k1") as never).create("staff-1");
    expect(new PendingLoginStore(config("k1") as never).consume(ticket)).toBe("staff-1");
  });

  it("rejects an expired ticket", () => {
    const store = new PendingLoginStore(config("k1") as never);
    const ticket = store.create("staff-1", 0);
    expect(store.consume(ticket, 5 * 60 * 1000 + 1)).toBeNull();
  });

  it("rejects a tampered or foreign ticket", () => {
    const store = new PendingLoginStore(config("k1") as never);
    const [body, signature] = store.create("staff-1").split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "staff-2", exp: Date.now() + 60_000, n: "x" })).toString("base64url");
    expect(store.consume(`${forged}.${signature}`)).toBeNull();
    expect(new PendingLoginStore(config("other-key") as never).consume(`${body}.${signature}`)).toBeNull();
    expect(store.consume("garbage")).toBeNull();
  });
});
