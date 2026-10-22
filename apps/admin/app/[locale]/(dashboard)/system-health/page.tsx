"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card } from "../../../../components/ui";

interface ProviderInstance {
  id: string;
  name: string;
  driver: string;
  capability: string;
}

interface UsageResult {
  supported: boolean;
  usedPercent?: number;
  details?: Record<string, unknown>;
}

/**
 * Minimal on purpose: the only thing the Cloudinary change request (2026-10-22,
 * §8) needs is credit-usage visibility + the 80%/95% thresholds. A fuller
 * system-health dashboard (queue depth, DB status, provider error rates…) is
 * its own future milestone — this page is the extension point, not a TODO
 * left unaddressed (see docs/PROGRESS.md).
 */
export default function SystemHealthPage() {
  const t = useTranslations("systemHealth");
  const [cloudinaryInstance, setCloudinaryInstance] = useState<ProviderInstance | null>(null);
  const [usage, setUsage] = useState<UsageResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const instances = await api.get<ProviderInstance[]>("/admin/providers?capability=storage");
      const cloudinary = instances.find((i) => i.driver === "cloudinary") ?? null;
      setCloudinaryInstance(cloudinary);
      if (cloudinary) {
        setUsage(await api.get<UsageResult>(`/admin/providers/${cloudinary.id}/usage`));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load system health");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() is also reused as a manual refresh below.
    void load();
  }, []);

  const percent = usage?.usedPercent ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && (
        <div className="mt-4">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      <Card className="mt-6 flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-surface-foreground">{t("cloudinaryUsageTitle")}</h2>
          <Button variant="secondary" onClick={() => void load()}>
            ↻
          </Button>
        </div>

        {!cloudinaryInstance && <p className="text-sm text-surface-foreground/60">{t("noCloudinaryInstance")}</p>}

        {cloudinaryInstance && usage?.supported && (
          <div className="flex flex-col gap-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full ${percent >= 95 ? "bg-danger" : percent >= 80 ? "bg-warning" : "bg-brand"}`}
                style={{ width: `${Math.min(100, percent)}%` }}
              />
            </div>
            <span className="text-sm text-surface-foreground">{percent.toFixed(1)}%</span>
            {percent >= 95 && <Banner kind="error">{t("dangerNear95")}</Banner>}
            {percent >= 80 && percent < 95 && <Banner kind="warning">{t("warningNear80")}</Banner>}
          </div>
        )}
      </Card>
    </div>
  );
}
