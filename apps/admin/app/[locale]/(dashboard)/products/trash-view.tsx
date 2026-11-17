"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { shortDate } from "../../../../lib/format";
import { useCurrentStaff } from "../../../../lib/use-current-staff";
import { Banner, Button, Card } from "../../../../components/ui";

interface TrashItem {
  id: string;
  title: { en?: string; bn?: string };
  slug: string;
  deletedAt: string;
  variantCount: number;
  hasOrderHistory: boolean;
}

interface PurgeResult {
  deleted: number;
  skipped: { id: string; reason: "not_in_trash" | "has_order_history" | "failed" }[];
}

/**
 * Products deleted from the catalog. Restore puts them back as drafts;
 * "Delete permanently" erases them from the database (needs `catalog.purge`,
 * and a typed confirmation because it can't be undone). Products that orders
 * still point at are marked and always kept, so order history never breaks.
 */
export function ProductTrashView({ onChanged }: { onChanged: () => void }) {
  const t = useTranslations("products");
  const tCommon = useTranslations("common");
  const { hasPermission } = useCurrentStaff();
  const canPurge = hasPermission("catalog.purge");
  const [items, setItems] = useState<TrashItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      setItems(await api.get<TrashItem[]>("/admin/products/trash"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load trash");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)));

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const handleRestore = () =>
    run(async () => {
      const result = await api.post<{ restored: number }>("/admin/products/restore", { ids: [...selected] });
      setNotice(t("trashRestored", { count: result.restored }));
      setSelected(new Set());
    });

  const handlePurge = () => {
    const ids = [...selected];
    const word = t("purgeConfirmWord");
    const typed = window.prompt(t("purgeConfirm", { count: ids.length, word }));
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== word.toLowerCase()) {
      setError(t("purgeWrongWord", { word }));
      return;
    }
    void run(async () => {
      const result = await api.post<PurgeResult>("/admin/products/purge", { ids });
      setNotice(t("purged", { count: result.deleted }));
      const kept = result.skipped.filter((s) => s.reason !== "not_in_trash");
      if (kept.length > 0) setError(t("purgeKept", { count: kept.length }));
      setSelected(new Set(kept.map((s) => s.id)));
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-surface-foreground/70">{t("trashHint")}</p>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-theme border border-border bg-muted px-4 py-2">
          <span className="text-sm text-surface-foreground">{t("selectedCount", { count: selected.size })}</span>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setSelected(new Set())} disabled={busy}>
              {tCommon("cancel")}
            </Button>
            <Button variant="secondary" onClick={() => void handleRestore()} disabled={busy}>
              {t("restoreSelected")}
            </Button>
            {canPurge && (
              <Button variant="danger" onClick={handlePurge} disabled={busy}>
                {t("purgeSelected")}
              </Button>
            )}
          </div>
        </div>
      )}
      {!canPurge && items.length > 0 && <p className="text-xs text-surface-foreground/50">{t("purgeNoPermission")}</p>}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
              <th className="w-10 px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={t("selectAll")} />
              </th>
              <th className="px-4 py-3">{t("titleEn")}</th>
              <th className="px-4 py-3">{t("deletedOn")}</th>
              <th className="px-4 py-3">{t("variantsTitle")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleOne(item.id)} aria-label={t("selectRow")} />
                </td>
                <td className="px-4 py-3 text-surface-foreground">{item.title.en ?? item.title.bn ?? item.slug}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{shortDate(item.deletedAt)}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{item.variantCount}</td>
                <td className="px-4 py-3 text-xs text-warning">{item.hasOrderHistory ? t("hasOrderHistory") : ""}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-surface-foreground/50" colSpan={5}>
                  {t("trashEmpty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
