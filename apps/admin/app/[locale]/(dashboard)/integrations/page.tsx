"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../components/ui";

// The env-configured default (local/s3) isn't managed here — see
// docs/DECISIONS.md. "storage" only lists *alternative* storage providers
// (Cloudinary) that an admin can switch to via the `media.defaultProvider`
// setting; email/sms were the Milestone 1 proof of the generic pattern.
const CAPABILITIES = ["storage", "email", "sms"] as const;

interface DriverCatalogEntry {
  capability: string;
  driver: string;
  label: { bn?: string; en?: string };
  secretFields: string[];
}

interface ProviderInstance {
  id: string;
  capability: string;
  driver: string;
  name: string;
  enabled: boolean;
  mode: "sandbox" | "live";
  config: Record<string, unknown>;
}

export default function IntegrationsPage() {
  const t = useTranslations("integrations");
  const [capability, setCapability] = useState<string>(CAPABILITIES[0]);
  const [catalog, setCatalog] = useState<DriverCatalogEntry[]>([]);
  const [instances, setInstances] = useState<ProviderInstance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [usage, setUsage] = useState<Record<string, { supported: boolean; usedPercent?: number }>>({});
  const [creatingDriver, setCreatingDriver] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [configText, setConfigText] = useState("{}");

  async function load() {
    try {
      const [catalogResult, instancesResult] = await Promise.all([
        api.get<DriverCatalogEntry[]>(`/admin/providers/catalog?capability=${capability}`),
        api.get<ProviderInstance[]>(`/admin/providers?capability=${capability}`),
      ]);
      setCatalog(catalogResult);
      setInstances(instancesResult);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load integrations");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally reruns only when the capability tab changes
  }, [capability]);

  async function handleCreate() {
    if (!creatingDriver) return;
    setError(null);
    try {
      const config = JSON.parse(configText);
      await api.post("/admin/providers", { capability, driver: creatingDriver, name, config });
      setCreatingDriver(null);
      setName("");
      setConfigText("{}");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create — check the config is valid JSON");
    }
  }

  async function handleTest(id: string) {
    try {
      const result = await api.post<{ ok: boolean; message: string }>(`/admin/providers/${id}/test-connection`);
      setResults((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setResults((prev) => ({ ...prev, [id]: { ok: false, message: err instanceof ApiError ? err.message : "Failed" } }));
    }
  }

  async function handleCheckUsage(id: string) {
    try {
      const result = await api.get<{ supported: boolean; usedPercent?: number }>(`/admin/providers/${id}/usage`);
      setUsage((prev) => ({ ...prev, [id]: result }));
    } catch {
      setUsage((prev) => ({ ...prev, [id]: { supported: false } }));
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      <div className="mt-4 flex gap-2">
        {CAPABILITIES.map((cap) => (
          <button
            key={cap}
            onClick={() => setCapability(cap)}
            className={`rounded-theme px-3 py-1.5 text-sm capitalize ${
              capability === cap ? "bg-brand text-brand-foreground" : "bg-muted text-surface-foreground"
            }`}
          >
            {cap}
          </button>
        ))}
      </div>
      {error && (
        <div className="mt-4">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      <Card className="mt-6">
        <ul className="flex flex-col gap-2">
          {instances.map((instance) => (
            <li key={instance.id} className="rounded-theme border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-surface-foreground">
                  {instance.name} <span className="text-surface-foreground/50">({instance.driver}, {instance.mode})</span>
                </div>
                <div className="flex gap-2">
                  {capability === "storage" && (
                    <Button variant="secondary" onClick={() => handleCheckUsage(instance.id)}>
                      {t("checkUsage")}
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => handleTest(instance.id)}>
                    {t("testConnection")}
                  </Button>
                </div>
              </div>
              {results[instance.id] && (
                <p className={`mt-2 text-xs ${results[instance.id]?.ok ? "text-success" : "text-danger"}`}>
                  {results[instance.id]?.ok ? t("testSuccess") : t("testFailure")}: {results[instance.id]?.message}
                </p>
              )}
              {usage[instance.id]?.supported && (
                <p className={`mt-2 text-xs ${(usage[instance.id]?.usedPercent ?? 0) >= 80 ? "text-danger" : "text-surface-foreground/60"}`}>
                  {t("usagePercent", { percent: (usage[instance.id]?.usedPercent ?? 0).toFixed(1) })}
                  {(usage[instance.id]?.usedPercent ?? 0) >= 95 && ` — ${t("usageFallbackActive")}`}
                </p>
              )}
            </li>
          ))}
          {instances.length === 0 && <p className="text-sm text-surface-foreground/60">—</p>}
        </ul>

        <div className="mt-4 border-t border-border pt-4">
          <div className="flex flex-wrap gap-2">
            {catalog.map((driver) => (
              <Button key={driver.driver} variant="secondary" onClick={() => setCreatingDriver(driver.driver)}>
                + {driver.label.en ?? driver.driver}
              </Button>
            ))}
          </div>
          {creatingDriver && (
            <div className="mt-4 flex flex-col gap-3">
              <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-surface-foreground">Config (JSON)</span>
                <textarea
                  className="h-28 rounded-theme border border-border bg-surface px-3 py-2 font-mono text-xs"
                  value={configText}
                  onChange={(e) => setConfigText(e.target.value)}
                />
              </label>
              <Button onClick={handleCreate}>Save</Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
