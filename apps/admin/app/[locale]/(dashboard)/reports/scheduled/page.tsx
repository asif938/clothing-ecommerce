"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { localized } from "../../../../../lib/format";
import { Banner, Button, Card, FieldLabel, TextField, Toggle } from "../../../../../components/ui";

interface CatalogEntry {
  key: string;
  permission: string;
  title: { bn: string; en: string };
}
interface ScheduledReport {
  id: string;
  name: string;
  reportKey: string;
  frequency: "daily" | "weekly" | "monthly";
  recipients: string[];
  locale: "bn" | "en";
  isActive: boolean;
  nextRunAt: string;
  lastSentAt: string | null;
  lastError: string | null;
}

const blank = () => ({ name: "", reportKey: "sales", frequency: "daily" as ScheduledReport["frequency"], recipients: "", locale: "bn" as "bn" | "en", isActive: true });

/** Scheduled email reports (§8.2 Reports "Scheduled email reports", §16 M12). */
export default function ScheduledReportsPage() {
  const t = useTranslations("scheduledReports");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [rows, setRows] = useState<ScheduledReport[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; form: ReturnType<typeof blank> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([api.get<CatalogEntry[]>("/admin/reports/scheduled/catalog"), api.get<ScheduledReport[]>("/admin/reports/scheduled")]);
      setCatalog(c);
      setRows(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount.
    void load();
  }, [load]);

  async function save() {
    if (!editing) return;
    const f = editing.form;
    const body = { ...f, recipients: f.recipients.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean) };
    setError(null);
    try {
      if (editing.id) await api.patch(`/admin/reports/scheduled/${editing.id}`, body);
      else await api.post("/admin/reports/scheduled", body);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  async function toggle(row: ScheduledReport, isActive: boolean) {
    try {
      await api.patch(`/admin/reports/scheduled/${row.id}`, { isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  async function sendNow(row: ScheduledReport) {
    setError(null);
    setNotice(null);
    try {
      const result = await api.post<{ sent: number }>(`/admin/reports/scheduled/${row.id}/send-now`);
      setNotice(t("sentNow", { count: result.sent }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Send failed");
    }
  }

  async function remove(row: ScheduledReport) {
    if (!window.confirm(t("deleteConfirm", { name: row.name }))) return;
    try {
      await api.delete(`/admin/reports/scheduled/${row.id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  const set = (patch: Partial<ReturnType<typeof blank>>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });
  const titleOf = (key: string) => {
    const entry = catalog.find((c) => c.key === key);
    return entry ? localized(entry.title, locale) : key;
  };
  const selectClass = "rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reports" className="text-sm text-brand hover:underline">
        ← {t("backToReports")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
        </div>
        {!editing && <Button onClick={() => setEditing({ id: null, form: blank() })}>{t("new")}</Button>}
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      {editing && (
        <Card className="flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <TextField label={t("name")} value={editing.form.name} onChange={(e) => set({ name: e.target.value })} />
            <FieldLabel>
              {t("report")}
              <select className={selectClass} value={editing.form.reportKey} onChange={(e) => set({ reportKey: e.target.value })}>
                {catalog.map((c) => (
                  <option key={c.key} value={c.key}>
                    {localized(c.title, locale)}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel>
              {t("frequency")}
              <select className={selectClass} value={editing.form.frequency} onChange={(e) => set({ frequency: e.target.value as ScheduledReport["frequency"] })}>
                {(["daily", "weekly", "monthly"] as const).map((f) => (
                  <option key={f} value={f}>
                    {t(`freq_${f}`)}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel>
              {t("language")}
              <select className={selectClass} value={editing.form.locale} onChange={(e) => set({ locale: e.target.value as "bn" | "en" })}>
                <option value="bn">বাংলা</option>
                <option value="en">English</option>
              </select>
            </FieldLabel>
          </div>
          <TextField label={t("recipients")} value={editing.form.recipients} onChange={(e) => set({ recipients: e.target.value })} placeholder="owner@example.com, manager@example.com" />
          <p className="text-xs text-surface-foreground/50">{t("cadenceHint")}</p>
          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={!editing.form.name.trim() || !editing.form.recipients.trim()}>
              {tCommon("save")}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {tCommon("cancel")}
            </Button>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <Card key={r.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-surface-foreground">{r.name}</p>
                <p className="text-xs text-surface-foreground/60">
                  {titleOf(r.reportKey)} · {t(`freq_${r.frequency}`)} · {r.recipients.join(", ")}
                </p>
              </div>
              <Toggle checked={r.isActive} onChange={(v) => void toggle(r, v)} />
            </div>
            <p className="text-xs text-surface-foreground/60">
              {t("nextRun")}: {new Date(r.nextRunAt).toLocaleString()} · {t("lastSent")}: {r.lastSentAt ? new Date(r.lastSentAt).toLocaleString() : "—"}
            </p>
            {r.lastError && <Banner kind="error">{r.lastError}</Banner>}
            <div className="flex gap-3 text-xs">
              <button className="text-brand hover:underline" onClick={() => void sendNow(r)}>
                {t("sendNow")}
              </button>
              <button
                className="text-brand hover:underline"
                onClick={() => setEditing({ id: r.id, form: { name: r.name, reportKey: r.reportKey, frequency: r.frequency, recipients: r.recipients.join(", "), locale: r.locale, isActive: r.isActive } })}
              >
                {tCommon("edit")}
              </button>
              <button className="text-danger hover:underline" onClick={() => void remove(r)}>
                {tCommon("delete")}
              </button>
            </div>
          </Card>
        ))}
        {rows.length === 0 && <p className="text-sm text-surface-foreground/50">{t("empty")}</p>}
      </div>
    </div>
  );
}
