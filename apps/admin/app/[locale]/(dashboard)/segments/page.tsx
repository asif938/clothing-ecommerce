"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../components/ui";
import { RfmPanel } from "../../../../components/rfm-panel";

interface Segment {
  id: string;
  name: { bn?: string; en?: string };
  rules: unknown;
  memberCountCache: number;
}

/** Customer segments (docs/PROJECT_SPEC.md §16 M8, §8.2 "segments builder (rules with live count)") — rules as JSON, matching the payment-rules/discounts MVP pattern; preview count is live, not the cached value, so the number on screen always reflects what's being edited. */
export default function SegmentsPage() {
  const t = useTranslations("segments");
  const tCommon = useTranslations("common");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nameEn, setNameEn] = useState("");
  const [nameBn, setNameBn] = useState("");
  const [rulesJson, setRulesJson] = useState('{"match":"all","conditions":[]}');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  async function load() {
    try {
      setSegments(await api.get<Segment[]>("/admin/segments"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load segments");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  async function handlePreview() {
    setJsonError(null);
    try {
      const rules = JSON.parse(rulesJson);
      const result = await api.post<{ count: number }>("/admin/segments/preview", rules);
      setPreviewCount(result.count);
    } catch {
      setJsonError(t("invalidJson"));
    }
  }

  async function handleCreate() {
    setJsonError(null);
    let rules: unknown;
    try {
      rules = JSON.parse(rulesJson);
    } catch {
      setJsonError(t("invalidJson"));
      return;
    }
    try {
      await api.post("/admin/segments", { name: { en: nameEn, bn: nameBn || undefined }, rules });
      setNameEn("");
      setNameBn("");
      setRulesJson('{"match":"all","conditions":[]}');
      setPreviewCount(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create segment");
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/admin/segments/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete segment");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}

      <RfmPanel onPresetsCreated={() => void load()} />

      <Card className="flex flex-col gap-3">
        {segments.map((segment) => (
          <div key={segment.id} className="flex items-center justify-between rounded-theme border border-border p-3">
            <span className="font-medium text-surface-foreground">
              {segment.name.en ?? segment.name.bn} <span className="text-xs text-surface-foreground/50">({t("members", { count: segment.memberCountCache })})</span>
            </span>
            <button onClick={() => void handleDelete(segment.id)} className="text-xs text-danger">{tCommon("delete")}</button>
          </div>
        ))}
        {segments.length === 0 && <p className="text-sm text-surface-foreground/50">—</p>}

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-end gap-2">
            <TextField label={t("nameEn")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            <TextField label={t("nameBn")} value={nameBn} onChange={(e) => setNameBn(e.target.value)} />
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-surface-foreground">{t("rules")}</span>
            <textarea value={rulesJson} onChange={(e) => setRulesJson(e.target.value)} rows={4} className="rounded-theme border border-border bg-surface px-3 py-2 text-xs font-mono" />
            <span className="text-xs text-surface-foreground/50">{t("rulesHelp")}</span>
          </label>
          {jsonError && <Banner kind="error">{jsonError}</Banner>}
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void handlePreview()}>{t("preview")}</Button>
            {previewCount !== null && <span className="text-sm text-surface-foreground/70">{t("members", { count: previewCount })}</span>}
          </div>
          <Button onClick={() => void handleCreate()} disabled={!nameEn} className="self-start">{t("add")}</Button>
        </div>
      </Card>
    </div>
  );
}
