"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";
import { SupportTabs } from "../../../../../components/support-tabs";
import { textareaClass } from "../../../../../components/marketing-tabs";
import { useCurrentStaff } from "../../../../../lib/use-current-staff";

interface CannedReply {
  id: string;
  title: string;
  shortcut: string;
  body: { bn?: string; en?: string };
  category: string | null;
  usageCount: number;
}

const EMPTY = { id: "", title: "", shortcut: "", bn: "", en: "", category: "" };

/** Canned replies (§8.2 Support): bilingual, with {variables}, inserted by "/shortcut" in the inbox. */
export default function CannedRepliesPage() {
  const t = useTranslations("canned");
  const { hasPermission } = useCurrentStaff();
  const canManage = hasPermission("support.manage");
  const [rows, setRows] = useState<CannedReply[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<CannedReply[]>("/admin/support/canned-replies"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  async function save() {
    setError(null);
    const body = { title: form.title, shortcut: form.shortcut, body: { bn: form.bn, en: form.en }, category: form.category || null };
    try {
      if (form.id) await api.patch(`/admin/support/canned-replies/${form.id}`, body);
      else await api.post("/admin/support/canned-replies", body);
      setForm(EMPTY);
      setNotice(t("saved"));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("deleteConfirm"))) return;
    try {
      await api.delete(`/admin/support/canned-replies/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      <SupportTabs />
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      {canManage && (
        <Card className="grid gap-3 sm:grid-cols-2">
          <TextField label={t("titleField")} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField label={t("shortcut")} value={form.shortcut} onChange={(e) => setForm({ ...form, shortcut: e.target.value.toLowerCase() })} placeholder="thanks" />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("bodyBn")}</span>
            <textarea className={textareaClass} rows={4} value={form.bn} onChange={(e) => setForm({ ...form, bn: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("bodyEn")}</span>
            <textarea className={textareaClass} rows={4} value={form.en} onChange={(e) => setForm({ ...form, en: e.target.value })} />
          </label>
          <TextField label={t("category")} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <p className="self-end text-xs text-surface-foreground/60">{t("variablesHelp")}</p>
          <div className="flex gap-2 sm:col-span-2">
            <Button disabled={!form.title.trim() || !form.shortcut.trim() || (!form.bn.trim() && !form.en.trim())} onClick={() => void save()}>
              {form.id ? t("update") : t("add")}
            </Button>
            {form.id && (
              <Button variant="secondary" onClick={() => setForm(EMPTY)}>
                {t("cancel")}
              </Button>
            )}
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        {rows.length === 0 && <p className="text-sm text-surface-foreground/60">{t("empty")}</p>}
        {rows.map((row) => (
          <div key={row.id} className="flex flex-col gap-1 border-b border-border pb-2 text-sm last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-mono text-xs text-brand">/{row.shortcut}</span> <span className="font-medium">{row.title}</span>
                {row.category && <span className="ml-2 text-xs text-surface-foreground/60">{row.category}</span>}
              </span>
              <span className="flex items-center gap-2 text-xs text-surface-foreground/60">
                {t("used", { count: row.usageCount })}
                {canManage && (
                  <>
                    <Button variant="secondary" onClick={() => setForm({ id: row.id, title: row.title, shortcut: row.shortcut, bn: row.body.bn ?? "", en: row.body.en ?? "", category: row.category ?? "" })}>
                      {t("edit")}
                    </Button>
                    <Button variant="danger" onClick={() => void remove(row.id)}>
                      {t("delete")}
                    </Button>
                  </>
                )}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-xs text-surface-foreground/80">{row.body.bn}</p>
            <p className="whitespace-pre-wrap text-xs text-surface-foreground/60">{row.body.en}</p>
          </div>
        ))}
      </Card>
    </div>
  );
}
