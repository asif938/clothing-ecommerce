/**
 * Dashboard widget catalog (docs/PROJECT_SPEC.md §8.2 Dashboard
 * "Customizable widgets per role (phase 2)", §16 M12). A layout is just an
 * ordered list of these keys; the admin renders each key, the API filters
 * out widgets the viewer lacks the permission for.
 */
export const DASHBOARD_WIDGETS = [
  { key: "kpis", permission: "reports.read", label: { bn: "মূল সূচক", en: "Key numbers" } },
  { key: "alerts", permission: "reports.read", label: { bn: "অ্যালার্ট", en: "Alerts" } },
  { key: "ordersByStatus", permission: "reports.read", label: { bn: "স্ট্যাটাস অনুযায়ী অর্ডার", en: "Orders by status" } },
  { key: "topProducts", permission: "reports.read", label: { bn: "শীর্ষ পণ্য", en: "Top products" } },
  { key: "lowStock", permission: "reports.read", label: { bn: "কম স্টক", en: "Low stock" } },
  { key: "codOutstanding", permission: "reports.read", label: { bn: "কুরিয়ারের কাছে বকেয়া COD", en: "COD outstanding" } },
  { key: "liveActivity", permission: "reports.read", label: { bn: "লাইভ ভিজিটর ও কার্ট", en: "Live visitors & carts" } },
  { key: "profitSnapshot", permission: "finance.profit.read", label: { bn: "প্রকৃত মুনাফা", en: "True profit" } },
] as const;

export type DashboardWidgetKey = (typeof DASHBOARD_WIDGETS)[number]["key"];
export const DASHBOARD_WIDGET_KEYS = DASHBOARD_WIDGETS.map((w) => w.key) as [DashboardWidgetKey, ...DashboardWidgetKey[]];

/** Built-in layout used when neither the staff member, their role, nor the store has saved one — the pre-M12 dashboard plus the new widgets. */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardWidgetKey[] = ["alerts", "kpis", "ordersByStatus", "topProducts", "lowStock", "codOutstanding", "profitSnapshot", "liveActivity"];

/** Drops unknown/duplicate keys and widgets the viewer can't see, keeping order. */
export function sanitizeDashboardLayout(widgets: readonly string[], canSee: (permission: string) => boolean): DashboardWidgetKey[] {
  const byKey = new Map(DASHBOARD_WIDGETS.map((w) => [w.key as string, w]));
  const out: DashboardWidgetKey[] = [];
  for (const key of widgets) {
    const widget = byKey.get(key);
    if (!widget || out.includes(widget.key) || !canSee(widget.permission)) continue;
    out.push(widget.key);
  }
  return out;
}
