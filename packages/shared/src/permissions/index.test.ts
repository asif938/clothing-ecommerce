import { describe, expect, it } from "vitest";
import { PERMISSIONS, isKnownPermission, listPermissionGroups } from "./index";

describe("permission catalog", () => {
  it("has no duplicate keys", () => {
    const keys = PERMISSIONS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every permission a bn and en label", () => {
    for (const permission of PERMISSIONS) {
      expect(permission.label.bn, permission.key).toBeTruthy();
      expect(permission.label.en, permission.key).toBeTruthy();
    }
  });

  it("recognizes known permissions and rejects unknown ones", () => {
    expect(isKnownPermission("audit.read")).toBe(true);
    expect(isKnownPermission("made.up.permission")).toBe(false);
  });

  it("groups permissions", () => {
    expect(listPermissionGroups().length).toBeGreaterThan(0);
  });
});
