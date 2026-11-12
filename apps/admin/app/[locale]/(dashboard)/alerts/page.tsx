"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { localized } from "../../../../lib/format";
import { Banner, Button, Card } from "../../../../components/ui";

interface AnomalyAlert {
  id: string;
  metric: string;
  severity: "warning" | "critical";
  message: { bn: string; en: string };
  createdAt: string;
  acknowledgedAt: string | null;
}

/** Anomaly alerts (§8.2 Dashboard "alerts (anomalies …)", §16 M12). Thresholds live in Settings → reports. */
export default function AlertsPage() {
  const t = useTranslations("alerts");
  const locale = useLocale();
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState<AnomalyAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<AnomalyAlert[]>(`/admin/alerts${showAll ? "?all=true" : ""}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [showAll]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / filter change.
    void load();
  }, [load]);

  async function acknowledge(id: string) {
    try {
      await api.post(`/admin/alerts/${id}/acknowledge`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function checkNow() {
    setNotice(null);
    try {
      const result = await api.post<{ created: number }>("/admin/alerts/check");
      setNotice(t("checked", { count: result.created }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowAll(!showAll)}>
            {showAll ? t("showOpen") : t("showAll")}
          </Button>
          <Button onClick={() => void checkNow()}>{t("checkNow")}</Button>
        </div>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="info">{notice}</Banner>}
      <div className="flex flex-col gap-3">
        {rows.map((a) => (
          <Card key={a.id} className={`flex flex-wrap items-center justify-between gap-2 ${a.severity === "critical" ? "border-danger/40" : "border-warning/40"}`}>
            <div>
              <p className={`text-xs font-semibold uppercase ${a.severity === "critical" ? "text-danger" : "text-warning"}`}>{t(`severity_${a.severity}`)}</p>
              <p className="text-sm text-surface-foreground">{localized(a.message, locale)}</p>
              <p className="text-xs text-surface-foreground/50">{new Date(a.createdAt).toLocaleString()}</p>
            </div>
            {a.acknowledgedAt ? (
              <span className="text-xs text-surface-foreground/50">{t("acknowledged")}</span>
            ) : (
              <Button variant="secondary" onClick={() => void acknowledge(a.id)}>
                {t("acknowledge")}
              </Button>
            )}
          </Card>
        ))}
        {rows.length === 0 && <p className="text-sm text-surface-foreground/50">{t("empty")}</p>}
      </div>
    </div>
  );
}
