"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { api, ApiError } from "../../../../../../lib/api";
import { Banner, Button, Card } from "../../../../../../components/ui";
import { SupportTabs } from "../../../../../../components/support-tabs";
import { CallButton } from "../../../../../../components/call-button";
import { selectClass, textareaClass } from "../../../../../../components/marketing-tabs";
import { Link } from "../../../../../../i18n/navigation";
import { money } from "../../../../../../lib/format";
import { PRIORITY_STYLE, SLA_STYLE, type TicketRow } from "../../../../../../components/ticket-styles";

interface TicketDetail {
  ticket: TicketRow & { conversationId: string | null; orderId: string | null; customerId: string | null; firstResponseAt: string | null; resolvedAt: string | null };
  messages: { id: string; authorType: string; staffId: string | null; body: string; internal: boolean; createdAt: string }[];
  order: { id: string; orderNumber: string; status: string; total: number } | null;
}

const TYPES = ["general", "order_issue", "delivery", "return_exchange", "payment", "product", "complaint"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const STATUSES = ["open", "pending", "resolved", "closed"] as const;

/** One ticket: SLA, fields, conversation of replies and internal notes (§16 M15). */
export default function TicketPage() {
  const t = useTranslations("tickets");
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<TicketDetail | null>(null);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get<TicketDetail>(`/admin/support/tickets/${params.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [params.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
    void api.get<{ id: string; name: string }[]>("/admin/support/conversations/agents").then(setAgents).catch(() => undefined);
  }, [load]);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <Banner kind="error">{error}</Banner> : null;
  const { ticket } = data;
  const patch = (body: Record<string, unknown>) => act(() => api.patch(`/admin/support/tickets/${ticket.id}`, body));
  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name ?? "";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/support/tickets" className="text-xs text-brand hover:underline">
          ← {t("title")}
        </Link>
        <h1 className="text-2xl font-semibold text-surface-foreground">
          <span className="font-mono text-base text-surface-foreground/60">{ticket.number}</span> {ticket.subject}
        </h1>
      </div>
      <SupportTabs />
      {error && <Banner kind="error">{error}</Banner>}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card className="flex flex-col gap-3">
          {data.messages.length === 0 && <p className="text-sm text-surface-foreground/60">{t("noMessages")}</p>}
          {data.messages.map((m) => (
            <div key={m.id} className={`rounded-theme px-3 py-2 text-sm ${m.internal ? "border border-warning/30 bg-warning/10" : "bg-muted"}`}>
              <p className="mb-0.5 text-[10px] uppercase tracking-wide text-surface-foreground/50">
                {m.internal ? t("internalNote") : t("reply")} · {agentName(m.staffId) || m.authorType} · {new Date(m.createdAt).toLocaleString()}
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          ))}
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <textarea className={textareaClass} rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? t("notePlaceholder") : t("replyPlaceholder")} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                {t("internalOnly")}
              </label>
              <Button
                disabled={busy || !body.trim()}
                onClick={() =>
                  void act(async () => {
                    await api.post(`/admin/support/tickets/${ticket.id}/messages`, { body: body.trim(), internal, sendToConversation: true });
                    setBody("");
                  })
                }
              >
                {internal ? t("addNote") : ticket.conversationId ? t("sendToCustomer") : t("logReply")}
              </Button>
            </div>
            {!internal && !ticket.conversationId && <p className="text-xs text-surface-foreground/60">{t("noConversationHelp")}</p>}
          </div>
        </Card>

        <Card className="flex flex-col gap-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
            <dt className="text-surface-foreground/60">{t("firstResponse")}</dt>
            <dd className={ticket.firstResponseSla ? SLA_STYLE[ticket.firstResponseSla] : undefined}>
              {ticket.firstResponseSla ? t(`sla_${ticket.firstResponseSla}`) : "—"} · {new Date(ticket.firstResponseDueAt).toLocaleString()}
            </dd>
            <dt className="text-surface-foreground/60">{t("resolution")}</dt>
            <dd className={ticket.resolutionSla ? SLA_STYLE[ticket.resolutionSla] : undefined}>
              {ticket.resolutionSla ? t(`sla_${ticket.resolutionSla}`) : "—"} · {new Date(ticket.resolutionDueAt).toLocaleString()}
            </dd>
          </dl>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">{t("status")}</span>
            <select className={selectClass} value={ticket.status} disabled={busy} onChange={(e) => void patch({ status: e.target.value })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status_${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">{t("priority")}</span>
            <select className={selectClass} value={ticket.priority} disabled={busy} onChange={(e) => void patch({ priority: e.target.value })}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`priority_${p}`)}
                </option>
              ))}
            </select>
            <span className={`self-start rounded-full px-2 py-0.5 text-xs ${PRIORITY_STYLE[ticket.priority]}`}>{t("priorityMovesSla")}</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">{t("type")}</span>
            <select className={selectClass} value={ticket.type} disabled={busy} onChange={(e) => void patch({ type: e.target.value })}>
              {TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`type_${ty}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">{t("assignee")}</span>
            <select className={selectClass} value={ticket.assignedTo ?? ""} disabled={busy} onChange={(e) => void patch({ assignedTo: e.target.value || null })}>
              <option value="">{t("unassigned")}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1 border-t border-border pt-2 text-xs">
            {ticket.contactName && <span>{ticket.contactName}</span>}
            {ticket.contactPhone && (
              <span className="flex flex-wrap items-center gap-2">
                {ticket.contactPhone} <CallButton phone={ticket.contactPhone} orderId={ticket.orderId ?? undefined} customerId={ticket.customerId ?? undefined} />
              </span>
            )}
            {data.order && (
              <Link href={`/orders/${data.order.id}`} className="text-brand hover:underline">
                {data.order.orderNumber} · {data.order.status} · {money(data.order.total)}
              </Link>
            )}
            {ticket.conversationId && (
              <Link href={`/support/inbox?c=${ticket.conversationId}`} className="text-brand hover:underline">
                {t("openConversation")}
              </Link>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
