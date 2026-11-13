"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { localized, shortDate } from "../../../../lib/format";
import { Banner, Button, Card, TextField } from "../../../../components/ui";

interface Scope {
  key: string;
  label: { bn: string; en: string };
}
interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  status: "active" | "revoked" | "expired";
  createdAt: string;
}

const STATUS_STYLE = { active: "bg-success/10 text-success", revoked: "bg-danger/10 text-danger", expired: "bg-muted text-surface-foreground/60" } as const;

/** API keys for the public read-only API (§11.1, §16 M17). The key itself is shown once, at creation. */
export default function ApiKeysPage() {
  const t = useTranslations("apiKeys");
  const locale = useLocale();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [expiresAt, setExpiresAt] = useState("");
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [k, s] = await Promise.all([api.get<ApiKeyRow[]>("/admin/api-keys"), api.get<Scope[]>("/admin/api-keys/scopes")]);
      setKeys(k);
      setScopes(s);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load.
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ key: string; name: string }>("/admin/api-keys", {
        name: name.trim(),
        scopes: [...picked],
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59+06:00`).toISOString() : null,
      });
      setCreated(result);
      setCopied(false);
      setName("");
      setPicked(new Set());
      setExpiresAt("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(key: ApiKeyRow) {
    if (!window.confirm(t("revokeConfirm", { name: key.name }))) return;
    try {
      await api.delete(`/admin/api-keys/${key.id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to revoke");
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const scopeLabel = (key: string) => {
    const found = scopes.find((s) => s.key === key);
    return found ? localized(found.label, locale) : key;
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      {created && (
        <Banner kind="warning">
          <p className="font-medium">{t("createdTitle", { name: created.name })}</p>
          <p className="mb-2 text-xs">{t("createdHint")}</p>
          <code className="block break-all rounded-theme bg-surface px-3 py-2 text-sm text-surface-foreground">{created.key}</code>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={() => copy(created.key)}>
              {copied ? t("copied") : t("copy")}
            </Button>
            <Button variant="secondary" onClick={() => setCreated(null)}>
              {t("done")}
            </Button>
          </div>
        </Banner>
      )}

      <Card className="flex flex-col gap-4">
        <h2 className="font-medium text-surface-foreground">{t("newKey")}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <TextField label={t("name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder={t("namePlaceholder")} />
          <TextField label={t("expires")} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-surface-foreground">{t("scopes")}</p>
          <div className="flex flex-wrap gap-3">
            {scopes.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-sm text-surface-foreground">
                <input
                  type="checkbox"
                  checked={picked.has(s.key)}
                  onChange={() =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(s.key)) next.delete(s.key);
                      else next.add(s.key);
                      return next;
                    })
                  }
                />
                {localized(s.label, locale)}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Button onClick={create} disabled={busy || !name.trim() || picked.size === 0}>
            {t("create")}
          </Button>
        </div>
        <p className="text-xs text-surface-foreground/50">{t("usage")}</p>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
              <th className="py-2 pr-4">{t("name")}</th>
              <th className="py-2 pr-4">{t("key")}</th>
              <th className="py-2 pr-4">{t("scopes")}</th>
              <th className="py-2 pr-4">{t("lastUsed")}</th>
              <th className="py-2 pr-4">{t("expires")}</th>
              <th className="py-2 pr-4">{t("status")}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-b border-border last:border-b-0">
                <td className="py-2 pr-4 text-surface-foreground">{k.name}</td>
                <td className="py-2 pr-4 font-mono text-xs text-surface-foreground/70">{k.prefix}…</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{k.scopes.map(scopeLabel).join(", ")}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{k.lastUsedAt ? shortDate(k.lastUsedAt) : t("never")}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{k.expiresAt ? shortDate(k.expiresAt) : "—"}</td>
                <td className="py-2 pr-4">
                  <span className={`rounded-theme px-2 py-0.5 text-xs ${STATUS_STYLE[k.status]}`}>{t(`status_${k.status}`)}</span>
                </td>
                <td className="py-2">
                  {k.status === "active" && (
                    <button onClick={() => revoke(k)} className="text-danger hover:underline">
                      {t("revoke")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-surface-foreground/50">
                  {t("none")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
