import { describe, expect, it } from "vitest";
import { addChild, changeType, cleanMenu, MAX_MENU_DEPTH, moveItem, removeItem, updateItem, validateMenu, type MenuItem } from "./menu-tree";

const tree = (): MenuItem[] => [
  { id: "a", label: { en: "Men" }, type: "category", targetId: "men", children: [{ id: "a1", label: { en: "Panjabi" }, type: "category", targetId: "men-panjabi" }] },
  { id: "b", label: { bn: "নারী" }, type: "category", targetId: "women" },
  { id: "c", label: { en: "Sale" }, type: "collection", targetId: "sale" },
];

describe("menu tree helpers", () => {
  it("updates a nested item without touching the original", () => {
    const original = tree();
    const next = updateItem(original, [0, 0], { label: { en: "Panjabis" } });
    expect(next[0]!.children![0]!.label.en).toBe("Panjabis");
    expect(original[0]!.children![0]!.label.en).toBe("Panjabi");
  });

  it("moves an item among its siblings and ignores moves past either end", () => {
    expect(moveItem(tree(), [1], -1).map((i) => i.id)).toEqual(["b", "a", "c"]);
    expect(moveItem(tree(), [0], -1).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(moveItem(tree(), [2], 1).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("removes nested and top-level items", () => {
    expect(removeItem(tree(), [0, 0])[0]!.children).toEqual([]);
    expect(removeItem(tree(), [1]).map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("adds children down to the maximum depth only", () => {
    let items = addChild(tree(), [0, 0], { id: "a1x", label: { en: "Eid" }, type: "collection", targetId: "eid" });
    expect(items[0]!.children![0]!.children!.map((i) => i.id)).toEqual(["a1x"]);
    expect(MAX_MENU_DEPTH).toBe(3);
    items = addChild(items, [0, 0, 0]);
    expect(items[0]!.children![0]!.children![0]!.children).toBeUndefined();
  });

  it("clears the old target when the type changes", () => {
    expect(changeType(tree(), [2], "url")[2]).toMatchObject({ type: "url", targetId: undefined, url: undefined });
  });
});

describe("validateMenu", () => {
  it("accepts a complete tree", () => {
    expect(validateMenu(tree())).toEqual([]);
  });

  it("flags a missing label, a missing target and a bad URL — with their paths", () => {
    const items: MenuItem[] = [
      { id: "x", label: {}, type: "category", targetId: "men" },
      { id: "y", label: { en: "Page" }, type: "page" },
      { id: "z", label: { en: "Link" }, type: "url", url: "javascript:alert(1)" },
    ];
    expect(validateMenu(items)).toEqual([
      { path: [0], problem: "label" },
      { path: [1], problem: "target" },
      { path: [2], problem: "url" },
    ]);
  });

  it("allows a target-less item that only heads its children (footer column)", () => {
    const items: MenuItem[] = [{ id: "h", label: { en: "Help" }, type: "page", children: [{ id: "h1", label: { en: "Returns" }, type: "page", targetId: "returns" }] }];
    expect(validateMenu(items)).toEqual([]);
  });

  it("accepts relative paths, https, mailto and tel URLs", () => {
    for (const url of ["/track", "https://facebook.com/x", "mailto:a@b.co", "tel:+880170"]) {
      expect(validateMenu([{ id: "u", label: { en: "U" }, type: "url", url }])).toEqual([]);
    }
  });
});

describe("cleanMenu", () => {
  it("trims labels, drops empty fields and the target of the other kind", () => {
    const cleaned = cleanMenu([{ id: "u", label: { bn: "  ", en: " Track " }, type: "url", url: " /track ", targetId: "stale", children: [] }]);
    expect(cleaned).toEqual([{ id: "u", label: { en: "Track" }, type: "url", url: "/track" }]);
  });
});
