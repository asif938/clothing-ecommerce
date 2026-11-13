"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";
import { SupportTabs } from "../../../../../components/support-tabs";
import { selectClass } from "../../../../../components/marketing-tabs";
import { Link, useRouter } from "../../../../../i18n/navigation";
import { PRIORITY_STYLE, SLA_STYLE, type TicketRow } from "../../../../../components/ticket-styles";

const TYPES = ["general", "order_issue", "delivery", "return_exchange", "payment", "product", "complaint"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

/** Tickets with SLA (§16 M15). */
export default function TicketsPage() {
  const t = useTranslations("tickets");
  const router = useRouter();
  const [filter, setFilter] = useState({ status: "active", priority: "", assigned: "all", breached: false, q: "" });
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [counts, setCounts] = useState<{ open: number; mine: number; breached: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", type: "general", priority: "normal", contactName: "", contactPhone: "" });

  const load = useCallback(async () => {
    const query = new URLSearchParams({ assigned: filter.assigned, pageSize: "50" });
    if (filter.status) query.set("status", filter.status);
    if (filter.priority) query.set("priority", filter.priority);
    if (filter.breached) query.set("breached", "true");
    if (filter.q.trim()) query.set("q", filter.q.trim());
    try {
      const [list, c] = await Promise.all([api.get<{ items: TicketRow[] }>(`/admin/support/tickets?${query.toString()}`), api.get<typeof counts>("/admin/support/tickets/counts")]);
      setRows(list.items);
      setCounts(c);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on filter change
    void load();
  }, [load]);

  async function create() {
    setError(null);
    try {
      const created = await api.post<{ id: string }>("/admin/support/tickets", {
        subject: form.subject,
        description: form.description || undefined,
        type: form.type,
        priority: form.priority,
        contactName: form.contactName || undefined,
        contactPhone: form.contactPhone || undefined,
      });
      router.push(`/support/tickets/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
          {counts && <p className="text-sm text-surface-foreground/60">{t("counts", counts)}</p>}
        </div>
        <Button onClick={() => setCreating((c) => !c)}>{t("new")}</Button>
      </div>
      <SupportTabs />
      {error && <Banner kind="error">{error}</Banner>}

      {creating && (
        <Card className="grid gap-3 sm:grid-cols-2">
          <TextField label={t("subject")} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <TextField label={t("description")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("type")}</span>
            <select className={selectClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`type_${ty}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("priority")}</span>
            <select className={selectClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`priority_${p}`)}
                </option>
              ))}
            </select>
          </label>
          <TextField label={t("contactName")} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          <TextField label={t("contactPhone")} value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          <div className="sm:col-span-2">
            <Button disabled={!form.subject.trim()} onClick={() => void create()}>
              {t("create")}
            </Button>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <select className={selectClass} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            {["active", "open", "pending", "resolved", "closed", ""].map((s) => (
              <option key={s} value={s}>
                {t(`status_${s || "all"}`)}
              </option>
            ))}
          </select>
          <select className={selectClass} value={filter.priority} onChange={(e) => setFilter({ ...filter, priority: e.target.value })}>
            <option value="">{t("allPriorities")}</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priority_${p}`)}
              </option>
            ))}
          </select>
          <select className={selectClass} value={filter.assigned} onChange={(e) => setFilter({ ...filter, assigned: e.target.value })}>
            {["all", "me", "unassigned"].map((a) => (
              <option key={a} value={a}>
                {t(`assigned_${a}`)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={filter.breached} onChange={(e) => setFilter({ ...filter, breached: e.target.checked })} />
            {t("breachedOnly")}
          </label>
          <input className={selectClass} placeholder={t("search")} value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        </div>
        {rows.length === 0 && <p className="text-sm text-surface-foreground/60">{t("empty")}</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-foreground/60">
                  <th className="py-1">{t("number")}</th>
                  <th>{t("subject")}</th>
                  <th>{t("priority")}</th>
                  <th>{t("status")}</th>
                  <th>{t("firstResponse")}</th>
                  <th>{t("resolution")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="py-2">
                      <Link href={`/support/tickets/${row.id}`} className="font-mono text-xs text-brand hover:underline">
                        {row.number}
                      </Link>
                    </td>
                    <td>
                      {row.subject}
                      {row.contactName && <span className="ml-1 text-xs text-surface-foreground/60">· {row.contactName}</span>}
                    </td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${PRIORITY_STYLE[row.priority]}`}>{t(`priority_${row.priority}`)}</span>
                    </td>
                    <td>{t(`status_${row.status}`)}</td>
                    <td className={row.firstResponseSla ? SLA_STYLE[row.firstResponseSla] : undefined}>{row.firstResponseSla ? t(`sla_${row.firstResponseSla}`) : "—"}</td>
                    <td className={row.resolutionSla ? SLA_STYLE[row.resolutionSla] : undefined}>
                      {row.resolutionSla ? t(`sla_${row.resolutionSla}`) : "—"}
                      <span className="block text-[10px] text-surface-foreground/50">{new Date(row.resolutionDueAt).toLocaleString()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
