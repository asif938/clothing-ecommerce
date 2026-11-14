/**
 * Pure helpers for the admin Menus editor (§9.3). A menu is a tree of items at
 * most three levels deep; an item is addressed by its index path, e.g. [1, 0]
 * = first child of the second top-level item. Every helper returns a new tree.
 */

export type MenuItemType = "category" | "collection" | "product" | "page" | "url";

export interface MenuItem {
  id: string;
  label: { bn?: string; en?: string };
  type: MenuItemType;
  /** The target's slug — storefront routes look categories/collections/products/pages up by slug. */
  targetId?: string;
  url?: string;
  children?: MenuItem[];
}

export const MAX_MENU_DEPTH = 3;

export type ItemPath = number[];

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function newMenuItem(): MenuItem {
  return { id: newId(), label: {}, type: "category" };
}

function mapAt(items: MenuItem[], path: ItemPath, fn: (siblings: MenuItem[], index: number) => MenuItem[]): MenuItem[] {
  const [head, ...rest] = path;
  if (head === undefined) return items;
  if (rest.length === 0) return fn(items, head);
  return items.map((item, index) => (index === head ? { ...item, children: mapAt(item.children ?? [], rest, fn) } : item));
}

export function updateItem(items: MenuItem[], path: ItemPath, patch: Partial<MenuItem>): MenuItem[] {
  return mapAt(items, path, (siblings, index) => siblings.map((item, i) => (i === index ? { ...item, ...patch } : item)));
}

export function removeItem(items: MenuItem[], path: ItemPath): MenuItem[] {
  return mapAt(items, path, (siblings, index) => siblings.filter((_, i) => i !== index));
}

/** Moves an item one place up (-1) or down (+1) among its siblings; a no-op at either end. */
export function moveItem(items: MenuItem[], path: ItemPath, direction: -1 | 1): MenuItem[] {
  return mapAt(items, path, (siblings, index) => {
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return siblings;
    const next = [...siblings];
    [next[index], next[target]] = [next[target]!, next[index]!];
    return next;
  });
}

export function addChild(items: MenuItem[], path: ItemPath, child: MenuItem = newMenuItem()): MenuItem[] {
  if (path.length >= MAX_MENU_DEPTH) return items;
  return mapAt(items, path, (siblings, index) => siblings.map((item, i) => (i === index ? { ...item, children: [...(item.children ?? []), child] } : item)));
}

/** Switching type clears the old target so a category slug never ends up as a page slug. */
export function changeType(items: MenuItem[], path: ItemPath, type: MenuItemType): MenuItem[] {
  return updateItem(items, path, { type, targetId: undefined, url: undefined });
}

export interface MenuIssue {
  path: ItemPath;
  problem: "label" | "target" | "url";
}

/** What must be fixed before saving: a label in at least one language, and a target (or URL). */
export function validateMenu(items: MenuItem[], parent: ItemPath = []): MenuIssue[] {
  const issues: MenuIssue[] = [];
  items.forEach((item, index) => {
    const path = [...parent, index];
    if (!item.label.bn?.trim() && !item.label.en?.trim()) issues.push({ path, problem: "label" });
    if (item.type === "url") {
      const url = item.url?.trim() ?? "";
      if (!url || !(url.startsWith("/") || /^https?:\/\//i.test(url) || url.startsWith("mailto:") || url.startsWith("tel:"))) issues.push({ path, problem: "url" });
    } else if (!item.targetId?.trim() && !(item.children && item.children.length > 0)) {
      // A target-less item is allowed only as a heading for its children (a footer column, a dropdown title).
      issues.push({ path, problem: "target" });
    }
    if (item.children) issues.push(...validateMenu(item.children, path));
  });
  return issues;
}

/** Drops empty optional fields so the stored JSON stays clean. */
export function cleanMenu(items: MenuItem[]): MenuItem[] {
  return items.map((item) => {
    const label: MenuItem["label"] = {};
    if (item.label.bn?.trim()) label.bn = item.label.bn.trim();
    if (item.label.en?.trim()) label.en = item.label.en.trim();
    const cleaned: MenuItem = { id: item.id, label, type: item.type };
    if (item.type === "url" && item.url?.trim()) cleaned.url = item.url.trim();
    if (item.type !== "url" && item.targetId?.trim()) cleaned.targetId = item.targetId.trim();
    if (item.children && item.children.length > 0) cleaned.children = cleanMenu(item.children);
    return cleaned;
  });
}

export function pathKey(path: ItemPath): string {
  return path.join(".");
}
