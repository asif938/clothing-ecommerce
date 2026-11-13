"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { localized } from "../../../../lib/format";
import { Banner, Button, Card, TextField, Toggle } from "../../../../components/ui";

interface EventDef {
  key: string;
  label: { bn: string; en: string };
}
interface Hook {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  consecutiveFailures: number;
  disabledReason: string | null;
  lastDeliveryAt: string | null;
}
interface Delivery {
  id: string;
  event: string;
  status: "pending" | "succeeded" | "failed";
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
}

const STATUS_STYLE = { pending: "bg-warning/10 text-warning", succeeded: "bg-success/10 text-success", failed: "bg-danger/10 text-danger" } as const;

/** Outbound webhooks (§11.1, §16 M17): endpoints, signing secrets, delivery log and retries. */
export default function WebhooksPage() {
  const t = useTranslations("webhooks");
  const locale = useLocale();
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [events, setEvents] = useState<EventDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ name: string; secret: string } | null>(null);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  const load = useCallback(async () => {
    try {
      const [h, e] = await Promise.all([api.get<Hook[]>("/admin/webhooks"), api.get<EventDef[]>("/admin/webhooks/events")]);
      setHooks(h);
      setEvents(e);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load.
    void load();
  }, [load]);

  const loadDeliveries = useCallback(async (id: string) => {
    setDeliveries(await api.get<Delivery[]>(`/admin/webhooks/${id}/deliveries`).catch(() => []));
  }, []);

  async function guard(action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  const create = () =>
    guard(async () => {
      setBusy(true);
      try {
        const result = await api.post<{ name: string; secret: string }>("/admin/webhooks", { name: name.trim(), url: url.trim(), events: [...picked] });
        setSecret({ name: result.name, secret: result.secret });
        setName("");
        setUrl("");
        setPicked(new Set());
        await load();
      } finally {
        setBusy(false);
      }
    });

  const toggleActive = (hook: Hook, value: boolean) =>
    guard(async () => {
      await api.patch(`/admin/webhooks/${hook.id}`, { isActive: value });
      await load();
    });

  const sendTest = (hook: Hook) =>
    guard(async () => {
      const result = await api.post<{ status: string; responseStatus: number | null; lastError: string | null }>(`/admin/webhooks/${hook.id}/test`);
      setNotice(result.status === "succeeded" ? t("testOk", { status: result.responseStatus ?? 0 }) : t("testFailed", { error: result.lastError ?? "" }));
      await load();
      if (openId === hook.id) await loadDeliveries(hook.id);
    });

  const rotate = (hook: Hook) =>
    guard(async () => {
      if (!window.confirm(t("rotateConfirm", { name: hook.name }))) return;
      const result = await api.post<{ secret: string }>(`/admin/webhooks/${hook.id}/rotate-secret`);
      setSecret({ name: hook.name, secret: result.secret });
    });

  const remove = (hook: Hook) =>
    guard(async () => {
      if (!window.confirm(t("deleteConfirm", { name: hook.name }))) return;
      await api.delete(`/admin/webhooks/${hook.id}`);
      if (openId === hook.id) setOpenId(null);
      await load();
    });

  const retry = (delivery: Delivery) =>
    guard(async () => {
      await api.post(`/admin/webhooks/deliveries/${delivery.id}/retry`);
      if (openId) await loadDeliveries(openId);
    });

  const eventLabel = (key: string) => {
    const found = events.find((e) => e.key === key);
    return found ? localized(found.label, locale) : key;
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="info">{notice}</Banner>}
      {secret && (
        <Banner kind="warning">
          <p className="font-medium">{t("secretTitle", { name: secret.name })}</p>
          <p className="mb-2 text-xs">{t("secretHint")}</p>
          <code className="block break-all rounded-theme bg-surface px-3 py-2 text-sm text-surface-foreground">{secret.secret}</code>
          <div className="mt-2">
            <Button variant="secondary" onClick={() => setSecret(null)}>
              {t("done")}
            </Button>
          </div>
        </Banner>
      )}

      <Card className="flex flex-col gap-4">
        <h2 className="font-medium text-surface-foreground">{t("newEndpoint")}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <TextField label={t("name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          <TextField label={t("url")} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-surface-foreground">{t("events")}</p>
          <div className="flex flex-wrap gap-3">
            {events.map((e) => (
              <label key={e.key} className="flex items-center gap-2 text-sm text-surface-foreground">
                <input
                  type="checkbox"
                  checked={picked.has(e.key)}
                  onChange={() =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(e.key)) next.delete(e.key);
                      else next.add(e.key);
                      return next;
                    })
                  }
                />
                {localized(e.label, locale)}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Button onClick={create} disabled={busy || !name.trim() || !url.trim() || picked.size === 0}>
            {t("create")}
          </Button>
        </div>
        <p className="text-xs text-surface-foreground/50">{t("verifyHint")}</p>
      </Card>

      {hooks.map((hook) => (
        <Card key={hook.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-medium text-surface-foreground">{hook.name}</h3>
              <p className="break-all text-xs text-surface-foreground/60">{hook.url}</p>
              <p className="mt-1 text-xs text-surface-foreground/70">{hook.events.map(eventLabel).join(", ")}</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-surface-foreground">
              {t("active")}
              <Toggle checked={hook.isActive} onChange={(v) => toggleActive(hook, v)} />
            </label>
          </div>
          {hook.disabledReason && !hook.isActive && <Banner kind="warning">{hook.disabledReason}</Banner>}
          <div className="flex flex-wrap gap-3 text-sm">
            <button onClick={() => sendTest(hook)} className="text-brand hover:underline">
              {t("sendTest")}
            </button>
            <button
              onClick={() => {
                const next = openId === hook.id ? null : hook.id;
                setOpenId(next);
                if (next) void loadDeliveries(next);
              }}
              className="text-brand hover:underline"
            >
              {openId === hook.id ? t("hideDeliveries") : t("showDeliveries")}
            </button>
            <button onClick={() => rotate(hook)} className="text-brand hover:underline">
              {t("rotateSecret")}
            </button>
            <button onClick={() => remove(hook)} className="text-danger hover:underline">
              {t("delete")}
            </button>
          </div>
          {openId === hook.id && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
                    <th className="py-2 pr-4">{t("when")}</th>
                    <th className="py-2 pr-4">{t("event")}</th>
                    <th className="py-2 pr-4">{t("status")}</th>
                    <th className="py-2 pr-4">{t("attempts")}</th>
                    <th className="py-2 pr-4">{t("response")}</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id} className="border-b border-border last:border-b-0">
                      <td className="py-2 pr-4 text-surface-foreground/80">{new Date(d.createdAt).toLocaleString(locale)}</td>
                      <td className="py-2 pr-4 text-surface-foreground">{eventLabel(d.event)}</td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-theme px-2 py-0.5 text-xs ${STATUS_STYLE[d.status]}`}>{t(`status_${d.status}`)}</span>
                      </td>
                      <td className="py-2 pr-4 text-surface-foreground/80">{d.attempts}</td>
                      <td className="py-2 pr-4 text-xs text-surface-foreground/70">{d.lastError ?? (d.responseStatus ? `HTTP ${d.responseStatus}` : "")}</td>
                      <td className="py-2">
                        {d.status !== "succeeded" && (
                          <button onClick={() => retry(d)} className="text-brand hover:underline">
                            {t("retry")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {deliveries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-3 text-surface-foreground/50">
                        {t("noDeliveries")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}
      {hooks.length === 0 && <p className="text-sm text-surface-foreground/50">{t("none")}</p>}
    </div>
  );
}
