import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { activeHref, NAV_GROUPS, NAV_TOP } from "./admin-nav";

const allItems = [NAV_TOP, ...NAV_GROUPS.flatMap((group) => group.items)];

describe("admin navigation", () => {
  it("lists every page exactly once", () => {
    const hrefs = allItems.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("has a bilingual label for every item and group", () => {
    const en = JSON.parse(readFileSync(new URL("../messages/en.json", import.meta.url), "utf8")) as { shell: Record<string, string> };
    const bn = JSON.parse(readFileSync(new URL("../messages/bn.json", import.meta.url), "utf8")) as { shell: Record<string, string> };
    const keys = [...allItems.map((item) => item.labelKey), ...NAV_GROUPS.map((group) => group.labelKey)];
    for (const key of keys) {
      expect(en.shell[key], `en shell.${key}`).toBeTruthy();
      expect(bn.shell[key], `bn shell.${key}`).toBeTruthy();
    }
  });

  it("marks a page and its detail pages as the same entry", () => {
    expect(activeHref("/orders")).toBe("/orders");
    expect(activeHref("/orders/ck12345")).toBe("/orders");
  });

  it("prefers the most specific entry over its parent", () => {
    expect(activeHref("/orders/kanban")).toBe("/orders/kanban");
    expect(activeHref("/staff/field-access")).toBe("/staff/field-access");
    expect(activeHref("/staff/abc")).toBe("/staff");
  });

  it("matches the dashboard only on the home path", () => {
    expect(activeHref("/")).toBe("/");
    expect(activeHref("/not-a-page")).toBeNull();
  });
});
