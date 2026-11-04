import { describe, expect, it, vi } from "vitest";
import { buildCustomerWhereFromRules, type SegmentRules } from "./segment-rules";

describe("buildCustomerWhereFromRules", () => {
  it("matches nothing for an empty condition list (not everything)", () => {
    expect(buildCustomerWhereFromRules({ match: "all", conditions: [] })).toEqual({ id: { equals: "__none__" } });
  });

  it("combines conditions with AND for match: all", () => {
    const rules: SegmentRules = {
      match: "all",
      conditions: [
        { field: "totalSpent", op: "gte", value: 500000 },
        { field: "status", op: "eq", value: "active" },
      ],
    };
    expect(buildCustomerWhereFromRules(rules)).toEqual({
      AND: [{ totalSpent: { gte: 500000 } }, { status: "active" }],
    });
  });

  it("combines conditions with OR for match: any", () => {
    const rules: SegmentRules = {
      match: "any",
      conditions: [
        { field: "tag", op: "eq", value: "vip" },
        { field: "tag", op: "eq", value: "wholesale" },
      ],
    };
    expect(buildCustomerWhereFromRules(rules)).toEqual({
      OR: [{ tags: { has: "vip" } }, { tags: { has: "wholesale" } }],
    });
  });

  it("maps tag with op 'in' to hasSome", () => {
    expect(buildCustomerWhereFromRules({ match: "all", conditions: [{ field: "tag", op: "in", value: ["vip", "wholesale"] }] })).toEqual({
      AND: [{ tags: { hasSome: ["vip", "wholesale"] } }],
    });
  });

  it("maps districtId through the addresses relation", () => {
    expect(buildCustomerWhereFromRules({ match: "all", conditions: [{ field: "districtId", op: "eq", value: "dist-1" }] })).toEqual({
      AND: [{ addresses: { some: { districtId: "dist-1" } } }],
    });
  });

  it("maps inactiveDays >= N to lastSeenAt older than the cutoff (or never seen)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00Z"));
    const result = buildCustomerWhereFromRules({ match: "all", conditions: [{ field: "inactiveDays", op: "gte", value: 30 }] });
    expect(result).toEqual({
      AND: [{ OR: [{ lastSeenAt: { lt: new Date("2026-01-02T00:00:00Z") } }, { lastSeenAt: null }] }],
    });
    vi.useRealTimers();
  });

  it("maps inactiveDays < N to a recent lastSeenAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00Z"));
    const result = buildCustomerWhereFromRules({ match: "all", conditions: [{ field: "inactiveDays", op: "lt", value: 7 }] });
    expect(result).toEqual({ AND: [{ lastSeenAt: { gte: new Date("2026-01-25T00:00:00Z") } }] });
    vi.useRealTimers();
  });
});
