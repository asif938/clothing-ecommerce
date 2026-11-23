import { describe, expect, it } from "vitest";
import { parseTrustProxy } from "./trust-proxy";

describe("parseTrustProxy", () => {
  it("defaults to one hop", () => expect(parseTrustProxy(undefined)).toBe(1));
  it("reads a hop count", () => expect(parseTrustProxy("2")).toBe(2));
  it("can be turned off", () => {
    expect(parseTrustProxy("false")).toBe(false);
    expect(parseTrustProxy("0")).toBe(false);
  });
  it("passes subnet lists through", () => expect(parseTrustProxy("loopback, 10.0.0.0/8")).toBe("loopback, 10.0.0.0/8"));
});
