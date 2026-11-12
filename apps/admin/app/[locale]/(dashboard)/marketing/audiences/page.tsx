"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { localized } from "../../../../../lib/format";
import { Banner, Button, Card, TextField, Toggle } from "../../../../../components/ui";
import { MarketingTabs, selectClass } from "../../../../../components/marketing-tabs";
import { Link } from "../../../../../i18n/navigation";

interface Provider {
  id: string;
  name: string;
  driver: string;
  enabled: boolean;
}

interface Sync {
  id: string;
  name: string;
  autoSync: boolean;
  status: "idle" | "running" | "succeeded" | "failed";
  lastSyncedAt: string | null;
  lastMemberCount: number;
  lastError: string | null;
  externalAudienceId: string | null;
  provider: Provider | null;
  segment: { id: string; name: { bn?: string; en?: string } } | null;
}

/** Segment → Meta Custom Audience / Google Customer Match (§8.2 Customers "audience sync", §16 M13). */
export default function AudiencesPage() {
  const t = useTranslations("audiences");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [data, setData] = useState<{ syncs: Sync[]; providers: Provider[] }>({ syncs: [], providers: [] });
  const [segments, setSegments] = useState<{ id: string; name: { bn?: string; en?: string } }[]>([]);
  const [form, setForm] = useState({ segmentId: "", providerInstanceId: "", name: "", autoSync: false });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([api.get<typeof data>("/admin/marketing/audiences"), api.get<typeof segments>("/admin/segments")]);
      setData(d);
      setSegments(s);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  useEffect(() => {
    if (!data.syncs.some((s) => s.status === "running")) return;
    const handle = setInterval(() => void load(), 5000);
    return () => clearInterval(handle);
  }, [data.syncs, load]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <MarketingTabs />
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      <Banner kind="info">{t("privacyNote")}</Banner>
      {data.providers.length === 0 && (
        <Banner kind="warning">
          {t("noProviders")}{" "}
          <Link href="/integrations" className="underline">
            {t("openIntegrations")}
          </Link>
        </Banner>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-surface-foreground/60">
              <th className="py-1">{t("name")}</th>
              <th>{t("segment")}</th>
              <th>{t("provider")}</th>
              <th>{t("status")}</th>
              <th>{t("lastSync")}</th>
              <th>{t("autoSync")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.syncs.map((s) => (
              <tr key={s.id} className="border-t border-border align-top">
                <td className="py-2">{s.name}</td>
                <td>{s.segment ? localized(s.segment.name, locale) : "—"}</td>
                <td>{s.provider ? `${s.provider.name} (${s.provider.driver})` : "—"}</td>
                <td>
                  {t(`status_${s.status}`)}
                  {s.lastError && <p className="text-xs text-danger">{s.lastError}</p>}
                </td>
                <td>{s.lastSyncedAt ? `${new Date(s.lastSyncedAt).toLocaleString()} · ${t("members", { count: s.lastMemberCount })}` : "—"}</td>
                <td>
                  <Toggle checked={s.autoSync} onChange={(v) => void run(() => api.patch(`/admin/marketing/audiences/${s.id}`, { autoSync: v }))} />
                </td>
                <td className="flex gap-3 py-2">
                  <button className="text-xs text-brand" disabled={s.status === "running"} onClick={() => void run(() => api.post(`/admin/marketing/audiences/${s.id}/sync`))}>
                    {t("syncNow")}
                  </button>
                  <button className="text-xs text-danger" onClick={() => void run(() => api.delete(`/admin/marketing/audiences/${s.id}`))}>
                    {tCommon("delete")}
                  </button>
                </td>
              </tr>
            ))}
            {data.syncs.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 text-surface-foreground/50">
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("segment")}</span>
          <select className={selectClass} value={form.segmentId} onChange={(e) => setForm({ ...form, segmentId: e.target.value })}>
            <option value="">—</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {localized(s.name, locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("provider")}</span>
          <select className={selectClass} value={form.providerInstanceId} onChange={(e) => setForm({ ...form, providerInstanceId: e.target.value })}>
            <option value="">—</option>
            {data.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.driver})
              </option>
            ))}
          </select>
        </label>
        <TextField label={t("audienceName")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label className="flex items-center gap-2 text-sm">
          <Toggle checked={form.autoSync} onChange={(v) => setForm({ ...form, autoSync: v })} />
          {t("autoSyncDaily")}
        </label>
        <Button
          disabled={!form.segmentId || !form.providerInstanceId || !form.name}
          onClick={() =>
            void run(async () => {
              await api.post("/admin/marketing/audiences", form);
              setForm({ segmentId: "", providerInstanceId: "", name: "", autoSync: false });
            })
          }
        >
          {t("add")}
        </Button>
      </Card>
    </div>
  );
}
