"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField, Toggle } from "../../../../components/ui";

/** Product feeds (docs/PROJECT_SPEC.md §16 M8) — a thin view over the `feeds.*` settings (already editable from the generic Settings page) that also shows the actual feed URLs, which the generated Settings UI has no way to compute (it only knows setting values, not routes). */
export default function FeedsPage() {
  const t = useTranslations("feeds");
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    try {
      const result = await api.get<{ settings: { key: string; value: unknown }[] }>("/admin/settings");
      const byKey = new Map(result.settings.map((s) => [s.key, s.value]));
      setEnabled(Boolean(byKey.get("feeds.enabled")));
      setToken((byKey.get("feeds.secretToken") as string | null) ?? "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load feed settings");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  function generateToken() {
    setToken(crypto.randomUUID().replace(/-/g, ""));
  }

  async function handleSave() {
    try {
      await api.patch("/admin/settings/feeds.enabled", { value: enabled });
      await api.patch("/admin/settings/feeds.secretToken", { value: token || null });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  }

  const active = enabled && !!token;
  const query = `?token=${token}`;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}
      <Card className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Toggle checked={enabled} onChange={setEnabled} /> {t("enabled")}
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <TextField label={t("secretToken")} value={token} onChange={(e) => { setToken(e.target.value); setSaved(false); }} />
          <Button variant="secondary" onClick={generateToken}>{t("generateToken")}</Button>
        </div>
        <Button onClick={() => void handleSave()} className="self-start">{t("save")}</Button>
        {saved && <p className="text-xs text-success">{t("saved")}</p>}

        {!active && <p className="text-xs text-surface-foreground/50">{t("disabledHelp")}</p>}
        {active && (
          <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
            <div>
              <span className="font-medium text-surface-foreground">{t("metaUrl")}: </span>
              <code className="break-all text-xs text-surface-foreground/70">{`<API_URL>/api/v1/feeds/meta-catalog.xml${query}`}</code>
            </div>
            <div>
              <span className="font-medium text-surface-foreground">{t("googleUrl")}: </span>
              <code className="break-all text-xs text-surface-foreground/70">{`<API_URL>/api/v1/feeds/google-merchant.xml${query}`}</code>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
