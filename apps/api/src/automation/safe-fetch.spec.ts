import { describe, expect, it, vi } from "vitest";
import { isPrivateAddress, postJsonSafely } from "./safe-fetch";

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.1", "172.31.255.255", "169.254.169.254", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:10.0.0.1"])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });
  it.each(["8.8.8.8", "172.32.0.1", "203.0.113.9", "2606:4700::1111"])("allows %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("postJsonSafely", () => {
  it("rejects non-https", async () => {
    await expect(postJsonSafely("http://8.8.8.8/hook", {})).rejects.toThrow(/https/);
  });
  it("rejects a private literal ip", async () => {
    await expect(postJsonSafely("https://10.0.0.1/hook", {})).rejects.toThrow(/private/);
  });
  it("posts to a public literal ip", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ status: 204 })) as unknown as typeof fetch;
    await expect(postJsonSafely("https://8.8.8.8/hook", { a: 1 }, fetchImpl)).resolves.toEqual({ status: 204 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
