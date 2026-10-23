import { describe, expect, it } from "vitest";
import { deviceVisibilityClassName, isBlockScheduledNow, isBlockVisibleForLocale } from "./registry.ts";

describe("isBlockScheduledNow", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("is visible with no schedule", () => {
    expect(isBlockScheduledNow({}, now)).toBe(true);
  });

  it("is hidden before startsAt and after endsAt", () => {
    expect(isBlockScheduledNow({ schedule: { startsAt: "2026-07-01T00:00:00Z" } }, now)).toBe(false);
    expect(isBlockScheduledNow({ schedule: { endsAt: "2026-06-01T00:00:00Z" } }, now)).toBe(false);
  });

  it("is visible inside the window", () => {
    expect(isBlockScheduledNow({ schedule: { startsAt: "2026-06-01T00:00:00Z", endsAt: "2026-07-01T00:00:00Z" } }, now)).toBe(true);
  });
});

describe("isBlockVisibleForLocale", () => {
  it("is visible everywhere with no restriction", () => {
    expect(isBlockVisibleForLocale({}, "en")).toBe(true);
  });

  it("restricts to the listed locales", () => {
    expect(isBlockVisibleForLocale({ visibility: { locales: ["bn"] } }, "en")).toBe(false);
    expect(isBlockVisibleForLocale({ visibility: { locales: ["bn"] } }, "bn")).toBe(true);
  });
});

describe("deviceVisibilityClassName", () => {
  it("renders everywhere with no restriction", () => {
    expect(deviceVisibilityClassName(undefined)).toBe("");
  });

  it("hides the breakpoints not listed", () => {
    expect(deviceVisibilityClassName({ devices: ["mobile"] })).toBe("block sm:hidden lg:hidden");
    expect(deviceVisibilityClassName({ devices: ["desktop"] })).toBe("hidden sm:hidden lg:block");
  });
});
