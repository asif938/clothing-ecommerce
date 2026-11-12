"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../lib/api";
import { useCurrentStaff } from "../lib/use-current-staff";
import { Banner, Button, Card, TextField } from "./ui";
import { selectClass, textareaClass } from "./marketing-tabs";

interface Draft {
  id: string;
  feature: "product_description" | "seo_meta" | "alt_text" | "translation";
  entityType: string;
  entityId: string;
  input: { direction?: string } | null;
  output: unknown;
  createdAt: string;
}

const FEATURES = ["product_description", "seo_meta", "alt_text", "translation"] as const;

/**
 * Product editor AI assistant (docs/PROJECT_SPEC.md §8.2 Catalog "AI
 * assistance", §16 M13). Generates drafts only; staff review (and may edit
 * the JSON) before applying — nothing is published automatically.
 */
export function AiAssistPanel({ productId, onApplied }: { productId: string; onApplied: () => void }) {
  const t = useTranslations("aiAssist");
  const { staff } = useCurrentStaff();
  const [feature, setFeature] = useState<(typeof FEATURES)[number]>("product_description");
  const [keywords, setKeywords] = useState("");
  const [direction, setDirection] = useState<"bn_to_en" | "en_to_bn">("bn_to_en");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = Boolean(staff?.permissions?.includes("ai.use"));

  const load = useCallback(async () => {
    try {
      setDrafts(await api.get<Draft[]>(`/admin/ai/products/${productId}/drafts`));
    } catch {
      /* no permission or AI off — the panel just stays empty */
    }
  }, [productId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed) return null;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/ai/products/${productId}/drafts`, { feature, keywords: keywords || undefined, direction: feature === "translation" ? direction : undefined });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function act(draft: Draft, action: "apply" | "discard") {
    setError(null);
    try {
      if (action === "apply" && edits[draft.id] !== undefined) {
        await api.patch(`/admin/ai/drafts/${draft.id}`, { output: JSON.parse(edits[draft.id]!) });
      }
      await api.post(`/admin/ai/drafts/${draft.id}/${action}`);
      setEdits((e) => {
        const next = { ...e };
        delete next[draft.id];
        return next;
      });
      await load();
      if (action === "apply") onApplied();
    } catch (err) {
      setError(err instanceof SyntaxError ? t("invalidJson") : err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold text-surface-foreground">{t("title")}</h2>
        <p className="text-xs text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("feature")}</span>
          <select className={selectClass} value={feature} onChange={(e) => setFeature(e.target.value as (typeof FEATURES)[number])}>
            {FEATURES.map((f) => (
              <option key={f} value={f}>
                {t(`feature_${f}`)}
              </option>
            ))}
          </select>
        </label>
        {(feature === "product_description" || feature === "seo_meta") && <TextField label={t("keywords")} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={t("keywordsPlaceholder")} />}
        {feature === "translation" && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-surface-foreground">{t("direction")}</span>
            <select className={selectClass} value={direction} onChange={(e) => setDirection(e.target.value as "bn_to_en" | "en_to_bn")}>
              <option value="bn_to_en">{t("bnToEn")}</option>
              <option value="en_to_bn">{t("enToBn")}</option>
            </select>
          </label>
        )}
        <Button onClick={() => void generate()} disabled={busy}>
          {busy ? t("generating") : t("generate")}
        </Button>
      </div>

      {drafts.length > 0 && <h3 className="text-sm font-medium text-surface-foreground">{t("pendingDrafts", { count: drafts.length })}</h3>}
      {drafts.map((draft) => (
        <div key={draft.id} className="flex flex-col gap-2 rounded-theme border border-border p-3">
          <div className="flex items-center justify-between text-xs text-surface-foreground/60">
            <span className="font-medium text-surface-foreground">
              {t(`feature_${draft.feature}`)}
              {draft.entityType === "product_media" ? ` · ${t("image")}` : ""}
              {draft.input?.direction ? ` · ${draft.input.direction === "bn_to_en" ? t("bnToEn") : t("enToBn")}` : ""}
            </span>
            <span>{new Date(draft.createdAt).toLocaleString()}</span>
          </div>
          <textarea className={`${textareaClass} font-mono text-xs`} rows={8} value={edits[draft.id] ?? JSON.stringify(draft.output, null, 2)} onChange={(e) => setEdits({ ...edits, [draft.id]: e.target.value })} />
          <div className="flex gap-2">
            <Button onClick={() => void act(draft, "apply")}>{t("apply")}</Button>
            <Button variant="secondary" onClick={() => void act(draft, "discard")}>
              {t("discard")}
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
}
