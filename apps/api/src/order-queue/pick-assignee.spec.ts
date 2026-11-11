import { describe, expect, it } from "vitest";
import { pickAssignee } from "./pick-assignee";

const d = (n: number) => new Date(2026, 0, n);

describe("pickAssignee", () => {
  it("returns null with nobody in the queue", () => {
    expect(pickAssignee([], "round_robin")).toBeNull();
  });
  it("round-robin picks never-assigned first, then the longest wait", () => {
    expect(pickAssignee([{ id: "a", openCount: 0, lastAssignedAt: d(5) }, { id: "b", openCount: 9, lastAssignedAt: null }], "round_robin")).toBe("b");
    expect(pickAssignee([{ id: "a", openCount: 0, lastAssignedAt: d(5) }, { id: "b", openCount: 9, lastAssignedAt: d(2) }], "round_robin")).toBe("b");
  });
  it("load-based picks the fewest open orders, tie goes to the longest wait", () => {
    expect(pickAssignee([{ id: "a", openCount: 3, lastAssignedAt: d(1) }, { id: "b", openCount: 1, lastAssignedAt: d(9) }], "load_based")).toBe("b");
    expect(pickAssignee([{ id: "a", openCount: 2, lastAssignedAt: d(5) }, { id: "b", openCount: 2, lastAssignedAt: d(3) }], "load_based")).toBe("b");
  });
  it("is deterministic on a full tie", () => {
    expect(pickAssignee([{ id: "b", openCount: 0, lastAssignedAt: null }, { id: "a", openCount: 0, lastAssignedAt: null }], "round_robin")).toBe("a");
  });
});
