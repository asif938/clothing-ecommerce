"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField, Toggle } from "../../../../components/ui";

type Channel = "sms" | "email" | "whatsapp";
const CHANNELS: Channel[] = ["sms", "email", "whatsapp"];
const TABS = ["templates", "channelRules", "logs"] as const;

interface LocalizedText {
  bn: string;
  en: string;
}
interface SmsEstimate {
  encoding: string;
  segments: number;
  costPoisha: number;
}
interface TemplateChannelData {
  id: string;
  isActive: boolean;
  subjectBn: string | null;
  subjectEn: string | null;
  bodyBn: string;
  bodyEn: string;
  smsEstimate: SmsEstimate | null;
}
interface EventTemplates {
  event: string;
  label: LocalizedText;
  help: LocalizedText;
  variables: string[];
  defaultChannelOrder: Channel[];
  templates: Record<Channel, TemplateChannelData | null>;
}
interface ChannelRule {
  event: string;
  label: LocalizedText;
  channels: Channel[];
  isCustomized: boolean;
}
interface NotificationLogRow {
  id: string;
  event: string;
  channel: Channel;
  to: string;
  status: "queued" | "retrying" | "sent" | "failed";
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
}

function TemplateEditor({ event, channel, data }: { event: string; channel: Channel; data: TemplateChannelData | null }) {
  const t = useTranslations("notifications");
  const [isActive, setIsActive] = useState(data?.isActive ?? true);
  const [subjectBn, setSubjectBn] = useState(data?.subjectBn ?? "");
  const [subjectEn, setSubjectEn] = useState(data?.subjectEn ?? "");
  const [bodyBn, setBodyBn] = useState(data?.bodyBn ?? "");
  const [bodyEn, setBodyEn] = useState(data?.bodyEn ?? "");
  const [testTo, setTestTo] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function handleSave() {
    try {
      await api.patch(`/admin/notifications/templates/${event}/${channel}`, {
        isActive,
        subjectBn: channel === "email" ? subjectBn || null : undefined,
        subjectEn: channel === "email" ? subjectEn || null : undefined,
        bodyBn,
        bodyEn,
      });
      setStatus(t("saved"));
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : "Failed to save");
    }
  }

  async function handleTestSend() {
    try {
      const result = await api.post<{ ok: boolean; error?: string }>("/admin/notifications/templates/test-send", { event, channel, locale: "bn", to: testTo });
      setStatus(result.ok ? t("testSendSuccess") : `${t("testSendFailed")}: ${result.error ?? ""}`);
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : t("testSendFailed"));
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-theme border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-surface-foreground">{t(channel)}</span>
        <Toggle checked={isActive} onChange={setIsActive} />
      </div>
      {channel === "email" && (
        <>
          <TextField label={t("subjectBn")} value={subjectBn} onChange={(e) => setSubjectBn(e.target.value)} />
          <TextField label={t("subjectEn")} value={subjectEn} onChange={(e) => setSubjectEn(e.target.value)} />
        </>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-surface-foreground">{t("bodyBn")}</span>
        <textarea value={bodyBn} onChange={(e) => setBodyBn(e.target.value)} rows={3} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-surface-foreground">{t("bodyEn")}</span>
        <textarea value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} rows={3} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" />
      </label>
      {channel === "sms" && data?.smsEstimate && (
        <p className="text-xs text-surface-foreground/60">
          {data.smsEstimate.segments} {t("smsSegments")} ({data.smsEstimate.encoding}) — {t("smsCost")}: ৳{(data.smsEstimate.costPoisha / 100).toFixed(2)}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Button onClick={() => void handleSave()}>{t("save")}</Button>
        <TextField label={t("testSendTo")} placeholder={t("testSendPlaceholder")} value={testTo} onChange={(e) => setTestTo(e.target.value)} />
        <Button variant="secondary" onClick={() => void handleTestSend()} disabled={!testTo}>
          {t("testSend")}
        </Button>
      </div>
      {status && <p className="text-xs text-surface-foreground/70">{status}</p>}
    </div>
  );
}

function TemplatesTab() {
  const t = useTranslations("notifications");
  const [events, setEvents] = useState<EventTemplates[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<EventTemplates[]>("/admin/notifications/templates")
      .then(setEvents)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load templates"));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {error && <Banner kind="error">{error}</Banner>}
      {events.map((event) => (
        <Card key={event.event} className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold text-surface-foreground">{event.label.bn} / {event.label.en}</h2>
            <p className="text-sm text-surface-foreground/60">{event.help.bn} — {event.help.en}</p>
            <p className="mt-1 text-xs text-surface-foreground/50">
              {t("variablesAvailable")}: {event.variables.map((v) => `{${v}}`).join(", ")}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {CHANNELS.map((channel) => (
              <TemplateEditor key={channel} event={event.event} channel={channel} data={event.templates[channel]} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ChannelRuleEditor({ rule, onSaved }: { rule: ChannelRule; onSaved: () => void }) {
  const t = useTranslations("notifications");
  const [channels, setChannels] = useState<Channel[]>(rule.channels);
  const [error, setError] = useState<string | null>(null);

  async function save(next: Channel[]) {
    setChannels(next);
    try {
      await api.patch(`/admin/notifications/channel-rules/${rule.event}`, { channels: next });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...channels];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    void save(next);
  }

  function remove(index: number) {
    void save(channels.filter((_, i) => i !== index));
  }

  function add(channel: Channel) {
    if (channels.includes(channel)) return;
    void save([...channels, channel]);
  }

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-surface-foreground">{rule.label.bn} / {rule.label.en}</span>
        <span className="text-xs text-surface-foreground/50">{rule.isCustomized ? t("customized") : t("usingDefault")}</span>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      <p className="text-xs font-medium text-surface-foreground/60">{t("effectiveOrder")}</p>
      <div className="flex flex-wrap items-center gap-2">
        {channels.map((channel, index) => (
          <div key={channel} className="flex items-center gap-1 rounded-theme bg-muted px-2 py-1 text-sm">
            <span>{index + 1}. {t(channel)}</span>
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="text-xs disabled:opacity-30">
              ↑
            </button>
            <button type="button" onClick={() => move(index, 1)} disabled={index === channels.length - 1} className="text-xs disabled:opacity-30">
              ↓
            </button>
            <button type="button" onClick={() => remove(index)} className="text-xs text-danger">
              ×
            </button>
          </div>
        ))}
        {channels.length === 0 && <span className="text-xs text-surface-foreground/50">—</span>}
      </div>
      <div className="flex gap-2">
        {CHANNELS.filter((c) => !channels.includes(c)).map((channel) => (
          <Button key={channel} variant="secondary" onClick={() => add(channel)}>
            + {t(channel)}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function ChannelRulesTab() {
  const [rules, setRules] = useState<ChannelRule[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<ChannelRule[]>("/admin/notifications/channel-rules")
      .then(setRules)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load channel rules"));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {error && <Banner kind="error">{error}</Banner>}
      {rules.map((rule) => (
        <ChannelRuleEditor key={rule.event} rule={rule} onSaved={load} />
      ))}
    </div>
  );
}

function LogsTab() {
  const t = useTranslations("notifications");
  const [rows, setRows] = useState<NotificationLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pageSize = 25;

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) params.set("status", status);
    if (channel) params.set("channel", channel);
    api
      .get<{ items: NotificationLogRow[]; total: number }>(`/admin/notifications/logs?${params.toString()}`)
      .then((result) => {
        setRows(result.items);
        setTotal(result.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load logs"));
  }, [page, status, channel]);

  return (
    <div className="flex flex-col gap-3">
      {error && <Banner kind="error">{error}</Banner>}
      <div className="flex flex-wrap gap-2">
        <select value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm">
          <option value="">{t("allChannels")}</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>{t(c)}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm">
          <option value="">{t("allStatuses")}</option>
          {(["queued", "retrying", "sent", "failed"] as const).map((s) => (
            <option key={s} value={s}>{t(`status${s[0]!.toUpperCase()}${s.slice(1)}`)}</option>
          ))}
        </select>
      </div>
      <Card className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-surface-foreground/60">{t("noLogs")}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
                <th className="py-2 pr-4">{t("colWhen")}</th>
                <th className="py-2 pr-4">{t("colEvent")}</th>
                <th className="py-2 pr-4">{t("colChannel")}</th>
                <th className="py-2 pr-4">{t("colTo")}</th>
                <th className="py-2 pr-4">{t("colStatus")}</th>
                <th className="py-2 pr-4">{t("colAttempts")}</th>
                <th className="py-2 pr-4">{t("colError")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0">
                  <td className="py-2 pr-4 whitespace-nowrap text-surface-foreground/70">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{row.event}</td>
                  <td className="py-2 pr-4">{t(row.channel)}</td>
                  <td className="py-2 pr-4">{row.to}</td>
                  <td className="py-2 pr-4">{t(`status${row.status[0]!.toUpperCase()}${row.status.slice(1)}`)}</td>
                  <td className="py-2 pr-4">{row.attempts}/{row.maxAttempts}</td>
                  <td className="max-w-xs truncate py-2 pr-4 text-xs text-danger">{row.lastError}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>←</Button>
        <span className="text-sm text-surface-foreground/60">{page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
        <Button variant="secondary" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>→</Button>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const t = useTranslations("notifications");
  const [tab, setTab] = useState<(typeof TABS)[number]>("templates");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      <div className="flex gap-2">
        {TABS.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`rounded-theme px-3 py-1.5 text-sm ${tab === tabKey ? "bg-brand text-brand-foreground" : "bg-muted text-surface-foreground"}`}
          >
            {t(`tab${tabKey[0]!.toUpperCase()}${tabKey.slice(1)}`)}
          </button>
        ))}
      </div>
      {tab === "templates" && <TemplatesTab />}
      {tab === "channelRules" && <ChannelRulesTab />}
      {tab === "logs" && <LogsTab />}
    </div>
  );
}
