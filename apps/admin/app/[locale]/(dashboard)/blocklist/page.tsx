"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../components/ui";

interface BlocklistEntry {
  id: string;
  type: "phone" | "ip" | "device" | "email" | "address_keyword";
  value: string;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const TYPES = ["phone", "ip", "device", "email", "address_keyword"] as const;

export default function BlocklistPage() {
  const t = useTranslations("blocklist");
  const [entries, setEntries] = useState<BlocklistEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<(typeof TYPES)[number]>("phone");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");

  async function load() {
    try {
      setEntries(await api.get<BlocklistEntry[]>("/admin/blocklist"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  async function handleAdd() {
    setError(null);
    try {
      await api.post("/admin/blocklist", { type, value, reason: reason || null });
      setValue("");
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add");
    }
  }

  async function handleRemove(id: string) {
    try {
      await api.delete(`/admin/blocklist/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <div className="flex gap-3">
          <select value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm">
            {TYPES.map((v) => (
              <option key={v} value={v}>
                {t(`type.${v}`)}
              </option>
            ))}
          </select>
          <TextField label={t("value")} value={value} onChange={(e) => setValue(e.target.value)} />
          <TextField label={t("reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <Button onClick={() => void handleAdd()} disabled={!value}>
          {t("add")}
        </Button>
      </Card>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
              <th className="px-4 py-3">{t("type.label")}</th>
              <th className="px-4 py-3">{t("value")}</th>
              <th className="px-4 py-3">{t("reason")}</th>
              <th className="px-4 py-3">{t("expires")}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-surface-foreground">{t(`type.${entry.type}`)}</td>
                <td className="px-4 py-3 font-mono text-surface-foreground">{entry.value}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{entry.reason ?? "—"}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{entry.expiresAt ? new Date(entry.expiresAt).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="danger" onClick={() => void handleRemove(entry.id)}>
                    ×
                  </Button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-surface-foreground/50" colSpan={5}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
