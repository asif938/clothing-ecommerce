import { describe, expect, it } from "vitest";
import { isIpAllowed } from "./ip-allowlist";

describe("isIpAllowed", () => {
  it("allows everything when the allow-list is empty (feature disabled)", () => {
    expect(isIpAllowed("203.0.113.4", "")).toBe(true);
    expect(isIpAllowed("203.0.113.4", "   ")).toBe(true);
  });

  it("matches an exact IP", () => {
    expect(isIpAllowed("203.0.113.4", "203.0.113.4")).toBe(true);
    expect(isIpAllowed("203.0.113.5", "203.0.113.4")).toBe(false);
  });

  it("matches a CIDR block", () => {
    expect(isIpAllowed("10.1.2.3", "10.0.0.0/8")).toBe(true);
    expect(isIpAllowed("11.1.2.3", "10.0.0.0/8")).toBe(false);
  });

  it("checks every entry in a comma-separated list", () => {
    const list = "203.0.113.4, 10.0.0.0/8, 192.168.1.1";
    expect(isIpAllowed("192.168.1.1", list)).toBe(true);
    expect(isIpAllowed("10.5.5.5", list)).toBe(true);
    expect(isIpAllowed("8.8.8.8", list)).toBe(false);
  });

  it("strips the ::ffff: IPv4-mapped IPv6 prefix before comparing", () => {
    expect(isIpAllowed("::ffff:203.0.113.4", "203.0.113.4")).toBe(true);
  });
});
