import { describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (hostname: string) => {
    if (hostname === "internal.example.com") return [{ address: "10.0.0.5", family: 4 }];
    if (hostname === "metadata.example.com") return [{ address: "169.254.169.254", family: 4 }];
    if (hostname === "gateway.example.com") return [{ address: "203.0.113.9", family: 4 }];
    throw new Error("NXDOMAIN");
  }),
}));

const { assertPublicHttpUrl } = await import("./ssrf-guard.ts");

describe("assertPublicHttpUrl", () => {
  it("rejects a non-http(s) scheme", async () => {
    await expect(assertPublicHttpUrl("ftp://gateway.example.com/x")).rejects.toThrow(/scheme/);
  });

  it("rejects an invalid URL", async () => {
    await expect(assertPublicHttpUrl("not a url")).rejects.toThrow(/valid URL/);
  });

  it("rejects the literal hostname \"localhost\"", async () => {
    await expect(assertPublicHttpUrl("http://localhost:4000/webhook")).rejects.toThrow(/localhost/);
  });

  it("rejects a literal private IPv4 address", async () => {
    await expect(assertPublicHttpUrl("http://127.0.0.1/x")).rejects.toThrow(/private\/reserved/);
    await expect(assertPublicHttpUrl("http://10.0.0.1/x")).rejects.toThrow(/private\/reserved/);
    await expect(assertPublicHttpUrl("http://192.168.1.1/x")).rejects.toThrow(/private\/reserved/);
  });

  it("rejects a hostname that resolves to a private address (DNS rebinding)", async () => {
    await expect(assertPublicHttpUrl("http://internal.example.com/x")).rejects.toThrow(/private\/reserved/);
  });

  it("rejects the cloud metadata address even via DNS", async () => {
    await expect(assertPublicHttpUrl("http://metadata.example.com/x")).rejects.toThrow(/private\/reserved/);
  });

  it("allows a hostname that resolves to a public address", async () => {
    await expect(assertPublicHttpUrl("https://gateway.example.com/webhook")).resolves.toBeUndefined();
  });

  it("allows a literal public IPv4 address", async () => {
    await expect(assertPublicHttpUrl("http://203.0.113.9/x")).resolves.toBeUndefined();
  });
});
