"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";
import { SupportTabs } from "../../../../../components/support-tabs";
import { CallButton } from "../../../../../components/call-button";
import { selectClass, textareaClass } from "../../../../../components/marketing-tabs";
import { Link } from "../../../../../i18n/navigation";
import { money } from "../../../../../lib/format";
import { useCurrentStaff } from "../../../../../lib/use-current-staff";

type Channel = "live_chat" | "whatsapp" | "messenger" | "instagram";
type Status = "open" | "waiting_agent" | "pending" | "resolved";

interface Conversation {
  id: string;
  channel: Channel;
  contactName: string | null;
  contactPhone: string | null;
  contactId: string;
  customerId: string | null;
  status: Status;
  assignedTo: string | null;
  botActive: boolean;
  handoffReason: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
  orderIds: string[];
}

interface Message {
  id: string;
  direction: "inbound" | "outbound" | "internal";
  authorType: "customer" | "staff" | "bot" | "system";
  staffId: string | null;
  body: string;
  attachments: { type: string; url?: string | null; caption?: string | null }[] | null;
  deliveryStatus: string;
  error: string | null;
  toolTrace: { tool: string; isError: boolean }[] | null;
  createdAt: string;
}

interface Detail {
  conversation: Conversation;
  messages: Message[];
  canReply: boolean;
}

interface ContextData {
  customer: { id: string; name: string | null; phone: string | null; email: string | null; ordersCount: number; totalSpent: number } | null;
  phone: string | null;
  orders: { id: string; orderNumber: string; status: string; total: number; createdAt: string }[];
  tickets: { id: string; number: string; subject: string; status: string }[];
}

interface Canned {
  id: string;
  title: string;
  shortcut: string;
}

interface ChannelRow {
  id: string;
  name: string;
  channel: string;
  enabled: boolean;
  isMock: boolean;
  readyToReceive: boolean;
  webhookPath: string;
}

const CHANNEL_BADGE: Record<Channel, string> = { live_chat: "bg-brand/10 text-brand", whatsapp: "bg-success/15 text-success", messenger: "bg-muted text-surface-foreground", instagram: "bg-warning/15 text-warning" };

/** Unified support inbox (§8.2 Support, §16 M15): conversation list, thread with composer, customer/order side panel. */
export default function InboxPage() {
  const t = useTranslations("inbox");
  const locale = useLocale() as "bn" | "en";
  const { staff, hasPermission } = useCurrentStaff();
  const [filter, setFilter] = useState<{ status: string; channel: string; assigned: string; q: string }>({ status: "active", channel: "", assigned: "all", q: "" });
  const [list, setList] = useState<Conversation[]>([]);
  const [summary, setSummary] = useState<{ waiting: number; unassigned: number; mine: number; unread: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [context, setContext] = useState<ContextData | null>(null);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [canned, setCanned] = useState<Canned[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    const query = new URLSearchParams({ assigned: filter.assigned, pageSize: "50" });
    if (filter.status) query.set("status", filter.status);
    if (filter.channel) query.set("channel", filter.channel);
    if (filter.q.trim()) query.set("q", filter.q.trim());
    try {
      const [rows, sum] = await Promise.all([api.get<{ items: Conversation[] }>(`/admin/support/conversations?${query.toString()}`), api.get<typeof summary>("/admin/support/conversations/summary")]);
      setList(rows.items);
      setSummary(sum);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [filter]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await api.get<Detail>(`/admin/support/conversations/${id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on filter change, then poll
    void loadList();
    const handle = setInterval(() => void loadList(), 10_000);
    return () => clearInterval(handle);
  }, [loadList]);

  useEffect(() => {
    // `?c=<id>` deep links from notifications (read here rather than useSearchParams, which would need a Suspense boundary).
    const fromLink = new URLSearchParams(window.location.search).get("c");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL on mount
    if (fromLink) setSelected(fromLink);
    void api.get<Canned[]>("/admin/support/canned-replies").then(setCanned).catch(() => undefined);
    void api.get<{ id: string; name: string }[]>("/admin/support/conversations/agents").then(setAgents).catch(() => undefined);
    void api.get<ChannelRow[]>("/admin/support/conversations/channels").then(setChannels).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selected) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per conversation, then poll
    setSuggestions([]);
    void loadDetail(selected);
    void api.get<ContextData>(`/admin/support/conversations/${selected}/context`).then(setContext).catch(() => setContext(null));
    const handle = setInterval(() => void loadDetail(selected), 5_000);
    return () => clearInterval(handle);
  }, [selected, loadDetail]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [detail?.messages.length]);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (selected) await loadDetail(selected);
      await loadList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!selected || !draft.trim()) return;
    const body = draft.trim();
    await act(async () => {
      await api.post(`/admin/support/conversations/${selected}/${mode === "reply" ? "reply" : "notes"}`, { body });
      setDraft("");
      setSuggestions([]);
    });
  }

  async function insertCanned(id: string) {
    if (!id) return;
    try {
      const { text } = await api.post<{ text: string }>(`/admin/support/canned-replies/${id}/render`, { conversationId: selected, locale });
      setDraft((d) => (d.trim() ? `${d.trim()}\n${text}` : text));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function suggest() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      setSuggestions((await api.post<{ suggestions: string[] }>(`/admin/support/conversations/${selected}/suggestions`)).suggestions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  // "/shortcut" typed at the start of the composer inserts that canned reply.
  function onDraftChange(value: string) {
    const match = /^\/([a-z0-9_-]{2,30})\s$/.exec(value);
    const hit = match ? canned.find((c) => c.shortcut === match[1]) : undefined;
    if (hit) {
      setDraft("");
      void insertCanned(hit.id);
    } else setDraft(value);
  }

  const conversation = detail?.conversation;
  const contactLabel = (c: Conversation) => c.contactName || c.contactPhone || `${t(`channel_${c.channel}`)} · ${c.contactId.slice(0, 8)}`;
  const orderLink = conversation
    ? `/orders/new?${new URLSearchParams({
        channel: conversation.channel === "whatsapp" ? "whatsapp" : conversation.channel === "live_chat" ? "phone" : "messenger",
        phone: context?.phone ?? conversation.contactPhone ?? "",
        name: conversation.contactName ?? context?.customer?.name ?? "",
        conversationId: conversation.id,
      }).toString()}`
    : "#";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        {summary && <p className="text-sm text-surface-foreground/60">{t("summary", summary)}</p>}
      </div>
      <SupportTabs />
      {error && <Banner kind="error">{error}</Banner>}

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr_18rem]">
        {/* Conversation list */}
        <Card className="flex max-h-[75vh] flex-col gap-2 overflow-hidden">
          <div className="grid grid-cols-2 gap-2">
            <select className={selectClass} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
              {["active", "waiting_agent", "open", "pending", "resolved", ""].map((s) => (
                <option key={s} value={s}>
                  {t(`status_${s || "all"}`)}
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
            <select className={`${selectClass} col-span-2`} value={filter.channel} onChange={(e) => setFilter({ ...filter, channel: e.target.value })}>
              <option value="">{t("allChannels")}</option>
              {(["live_chat", "whatsapp", "messenger", "instagram"] as const).map((c) => (
                <option key={c} value={c}>
                  {t(`channel_${c}`)}
                </option>
              ))}
            </select>
            <input className={`${selectClass} col-span-2`} placeholder={t("search")} value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
          </div>
          <ul className="-mx-2 flex-1 overflow-y-auto">
            {list.length === 0 && <li className="px-2 py-4 text-sm text-surface-foreground/60">{t("empty")}</li>}
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setSelected(c.id)} className={`flex w-full flex-col gap-0.5 rounded-theme px-2 py-2 text-left text-sm ${selected === c.id ? "bg-muted" : "hover:bg-muted/60"}`}>
                  <span className="flex items-center gap-2">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${CHANNEL_BADGE[c.channel]}`}>{t(`channel_${c.channel}`)}</span>
                    <span className="flex-1 truncate font-medium">{contactLabel(c)}</span>
                    {c.unreadCount > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] text-brand-foreground">{c.unreadCount}</span>}
                  </span>
                  <span className="truncate text-xs text-surface-foreground/60">{c.lastMessagePreview ?? ""}</span>
                  <span className="text-[10px] text-surface-foreground/50">
                    {t(`status_${c.status}`)}
                    {c.botActive ? ` · ${t("botOn")}` : ""} · {new Date(c.lastMessageAt).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* Thread */}
        <Card className="flex max-h-[75vh] min-h-[24rem] flex-col gap-3">
          {!conversation && <p className="text-sm text-surface-foreground/60">{t("pickOne")}</p>}
          {conversation && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                <div>
                  <p className="font-semibold">{contactLabel(conversation)}</p>
                  <p className="text-xs text-surface-foreground/60">
                    {t(`channel_${conversation.channel}`)} · {t(`status_${conversation.status}`)}
                    {conversation.handoffReason && conversation.status === "waiting_agent" ? ` — ${conversation.handoffReason}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={selectClass}
                    value={conversation.assignedTo ?? ""}
                    disabled={busy}
                    onChange={(e) => void act(() => api.put(`/admin/support/conversations/${conversation.id}/assignee`, { staffId: e.target.value || null }))}
                  >
                    <option value="">{t("unassigned")}</option>
                    {agents
                      .filter((a) => hasPermission("support.manage") || a.id === staff?.id || a.id === conversation.assignedTo)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.id === staff?.id ? t("me", { name: a.name }) : a.name}
                        </option>
                      ))}
                  </select>
                  <Button variant="secondary" disabled={busy} onClick={() => void act(() => api.put(`/admin/support/conversations/${conversation.id}/bot`, { active: !conversation.botActive }))}>
                    {conversation.botActive ? t("stopBot") : t("startBot")}
                  </Button>
                  {conversation.status !== "resolved" ? (
                    <Button disabled={busy} onClick={() => void act(() => api.put(`/admin/support/conversations/${conversation.id}/status`, { status: "resolved" }))}>
                      {t("resolve")}
                    </Button>
                  ) : (
                    <Button variant="secondary" disabled={busy} onClick={() => void act(() => api.put(`/admin/support/conversations/${conversation.id}/status`, { status: "open" }))}>
                      {t("reopen")}
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
                {detail.messages.map((m) => {
                  const mine = m.direction !== "inbound";
                  const tone = m.direction === "internal" ? "bg-warning/10 border border-warning/30" : m.authorType === "bot" ? "bg-brand/10" : mine ? "bg-muted" : "bg-surface border border-border";
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-theme px-3 py-2 text-sm ${tone}`}>
                        <p className="mb-0.5 text-[10px] uppercase tracking-wide text-surface-foreground/50">
                          {t(`author_${m.direction === "internal" ? "note" : m.authorType}`)} · {new Date(m.createdAt).toLocaleTimeString()}
                          {m.direction === "outbound" && ` · ${t(`delivery_${m.deliveryStatus}`)}`}
                        </p>
                        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                        {m.attachments?.map((a, i) =>
                          a.url ? (
                            <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block text-xs text-brand underline">
                              [{a.type}]
                            </a>
                          ) : (
                            <p key={i} className="text-xs text-surface-foreground/60">
                              [{a.type}]
                            </p>
                          ),
                        )}
                        {m.error && <p className="mt-1 text-xs text-danger">{m.error}</p>}
                        {m.toolTrace && m.toolTrace.length > 0 && <p className="mt-1 text-[10px] text-surface-foreground/50">{t("usedTools", { tools: m.toolTrace.map((tr) => tr.tool).join(", ") })}</p>}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-2">
                {!detail.canReply && mode === "reply" && <Banner kind="warning">{t("windowClosed")}</Banner>}
                {conversation.botActive && <p className="text-xs text-surface-foreground/60">{t("botActiveHelp")}</p>}
                {suggestions.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {suggestions.map((s, i) => (
                      <button key={i} type="button" onClick={() => setDraft(s)} className="rounded-theme border border-border px-2 py-1 text-left text-xs hover:bg-muted">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <select className={selectClass} value={mode} onChange={(e) => setMode(e.target.value as "reply" | "note")}>
                    <option value="reply">{t("modeReply")}</option>
                    <option value="note">{t("modeNote")}</option>
                  </select>
                  <select className={selectClass} value="" onChange={(e) => void insertCanned(e.target.value)}>
                    <option value="">{t("insertCanned")}</option>
                    {canned.map((c) => (
                      <option key={c.id} value={c.id}>
                        /{c.shortcut} — {c.title}
                      </option>
                    ))}
                  </select>
                  {hasPermission("ai.use") && (
                    <Button variant="secondary" disabled={busy} onClick={() => void suggest()}>
                      {t("suggest")}
                    </Button>
                  )}
                </div>
                <textarea
                  className={textareaClass}
                  rows={3}
                  value={draft}
                  placeholder={mode === "reply" ? t("replyPlaceholder") : t("notePlaceholder")}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
                  }}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-surface-foreground/50">{t("sendHint")}</span>
                  <Button disabled={busy || !draft.trim() || (mode === "reply" && !detail.canReply)} onClick={() => void send()}>
                    {mode === "reply" ? t("send") : t("addNote")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>

        {/* Side panel */}
        <div className="flex flex-col gap-4">
          {conversation && (
            <Card className="flex flex-col gap-2 text-sm">
              <h2 className="text-sm font-semibold">{t("customer")}</h2>
              {context?.customer ? (
                <>
                  <Link href={`/customers/${context.customer.id}`} className="text-brand hover:underline">
                    {context.customer.name ?? context.customer.phone}
                  </Link>
                  <p className="text-xs text-surface-foreground/60">{t("customerStats", { orders: context.customer.ordersCount, spent: money(context.customer.totalSpent) })}</p>
                </>
              ) : (
                <p className="text-xs text-surface-foreground/60">{t("notACustomer")}</p>
              )}
              {context?.phone && (
                <p className="flex flex-wrap items-center gap-2">
                  {context.phone} <CallButton phone={context.phone} customerId={context.customer?.id} conversationId={conversation.id} />
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href={orderLink} className="rounded-theme bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground">
                  {t("createOrder")}
                </Link>
                {hasPermission("support.tickets") && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const subject = detail?.messages.filter((m) => m.authorType === "customer").pop()?.body.slice(0, 120) || t("ticketFromChat");
                        await api.post("/admin/support/tickets", { subject, conversationId: conversation.id });
                        setContext(await api.get<ContextData>(`/admin/support/conversations/${conversation.id}/context`));
                      })
                    }
                  >
                    {t("createTicket")}
                  </Button>
                )}
              </div>
              {context && context.orders.length > 0 && (
                <div className="flex flex-col gap-1 pt-2">
                  <h3 className="text-xs font-semibold text-surface-foreground/70">{t("orders")}</h3>
                  {context.orders.map((o) => (
                    <Link key={o.id} href={`/orders/${o.id}`} className="flex justify-between text-xs hover:underline">
                      <span>{o.orderNumber}</span>
                      <span className="text-surface-foreground/60">
                        {o.status} · {money(o.total)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              {context && context.tickets.length > 0 && (
                <div className="flex flex-col gap-1 pt-2">
                  <h3 className="text-xs font-semibold text-surface-foreground/70">{t("tickets")}</h3>
                  {context.tickets.map((tk) => (
                    <Link key={tk.id} href={`/support/tickets/${tk.id}`} className="text-xs hover:underline">
                      {tk.number} · {tk.subject} ({tk.status})
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          )}
          <ChannelsCard channels={channels} />
        </div>
      </div>
    </div>
  );
}

function ChannelsCard({ channels }: { channels: ChannelRow[] }) {
  const t = useTranslations("inbox");
  const [simulate, setSimulate] = useState({ instanceId: "", contactId: "test-customer-1", text: "" });
  const [notice, setNotice] = useState<string | null>(null);
  const mocks = channels.filter((c) => c.isMock && c.enabled);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <Card className="flex flex-col gap-2 text-sm">
      <h2 className="text-sm font-semibold">{t("channels")}</h2>
      {channels.length === 0 && (
        <p className="text-xs text-surface-foreground/60">
          {t("noChannels")}{" "}
          <Link href="/integrations" className="text-brand hover:underline">
            {t("integrations")}
          </Link>
        </p>
      )}
      {channels.map((c) => (
        <div key={c.id} className="flex flex-col gap-0.5 border-t border-border pt-2 text-xs">
          <span className="font-medium">
            {c.name} · {t(`channel_${c.channel}`)} {c.enabled ? "" : `(${t("disabled")})`}
          </span>
          {!c.isMock && <span className={c.readyToReceive ? "text-success" : "text-warning"}>{c.readyToReceive ? t("ready") : t("needsSecret")}</span>}
          <code className="break-all text-[10px] text-surface-foreground/60">{`${origin}/api/v1${c.webhookPath}`}</code>
        </div>
      ))}
      {mocks.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-2">
          <h3 className="text-xs font-semibold">{t("simulateTitle")}</h3>
          <select className={selectClass} value={simulate.instanceId} onChange={(e) => setSimulate({ ...simulate, instanceId: e.target.value })}>
            <option value="">—</option>
            {mocks.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.channel})
              </option>
            ))}
          </select>
          <TextField label={t("simulateContact")} value={simulate.contactId} onChange={(e) => setSimulate({ ...simulate, contactId: e.target.value })} />
          <TextField label={t("simulateText")} value={simulate.text} onChange={(e) => setSimulate({ ...simulate, text: e.target.value })} />
          <Button
            variant="secondary"
            disabled={!simulate.instanceId || !simulate.text.trim()}
            onClick={() =>
              void api
                .post<{ ok: boolean; message?: string }>("/admin/support/conversations/simulate", simulate)
                .then((r) => setNotice(r.ok ? t("simulated") : (r.message ?? "")))
                .catch((err: unknown) => setNotice(err instanceof ApiError ? err.message : "Failed"))
            }
          >
            {t("simulateSend")}
          </Button>
          {notice && <p className="text-xs text-surface-foreground/70">{notice}</p>}
        </div>
      )}
    </Card>
  );
}
