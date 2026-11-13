"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ChatMessage {
  id: string;
  direction: "inbound" | "outbound";
  authorType: "customer" | "staff" | "bot" | "system";
  body: string;
  createdAt: string;
}

interface Thread {
  conversationId: string | null;
  status: string | null;
  waitingForAgent?: boolean;
  greeting: string;
  messages: ChatMessage[];
}

const POLL_MS = 4000;

/**
 * Storefront live chat (docs/PROJECT_SPEC.md §16 M15). Messages land in the
 * staff support inbox; the AI assistant may answer first (when enabled)
 * until the shopper asks for a person. Polls only while open — no
 * websockets on the free tier. The shopper is identified by the API's own
 * cookie, so nothing personal is stored in the browser.
 */
export function LiveChatWidget({ locale }: { locale: string }) {
  const bn = locale === "bn";
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/store/support/chat?locale=${bn ? "bn" : "en"}`, { credentials: "same-origin", cache: "no-store" });
      if (res.ok) setThread((await res.json()) as Thread);
    } catch {
      // keep the last thread on a network blip
    }
  }, [bn]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when opened, then poll
    void load();
    const handle = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(handle);
  }, [open, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages.length, open]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/store/support/chat/messages", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body, name: name.trim() || null, phone: phone.trim() || null }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "Failed");
      }
      setText("");
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed" ? err.message : bn ? "পাঠানো যায়নি, আবার চেষ্টা করুন।" : "Couldn't send — please try again.");
    } finally {
      setSending(false);
    }
  }

  async function askForPerson() {
    await fetch("/api/v1/store/support/chat/handoff", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: bn ? "bn" : "en" }) }).catch(() => undefined);
    await load();
  }

  const started = Boolean(thread?.conversationId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-foreground text-surface shadow-lg"
        aria-label={bn ? "লাইভ চ্যাট" : "Live chat"}
        aria-expanded={open}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 5h16v11H9l-5 4z" />}
        </svg>
      </button>

      {open && (
        <div role="dialog" aria-label={bn ? "লাইভ চ্যাট" : "Live chat"} className="fixed bottom-20 right-4 z-50 flex h-[min(30rem,calc(100vh-7rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-theme border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-surface-foreground">{bn ? "আমাদের সাথে চ্যাট করুন" : "Chat with us"}</p>
            {started && !thread?.waitingForAgent && (
              <button type="button" onClick={() => void askForPerson()} className="text-xs text-brand underline">
                {bn ? "মানুষের সাথে কথা বলুন" : "Talk to a person"}
              </button>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3 text-sm">
            {thread?.greeting && <p className="self-start rounded-theme bg-muted px-3 py-2 text-surface-foreground">{thread.greeting}</p>}
            {thread?.messages.map((m) => (
              <p
                key={m.id}
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-theme px-3 py-2 ${m.direction === "inbound" ? "self-end bg-brand text-brand-foreground" : "self-start bg-muted text-surface-foreground"}`}
              >
                {m.body}
              </p>
            ))}
            {thread?.waitingForAgent && <p className="self-center text-xs text-surface-foreground/60">{bn ? "একজন প্রতিনিধি শিগগিরই উত্তর দেবেন।" : "A team member will reply shortly."}</p>}
            <div ref={bottomRef} />
          </div>

          <div className="flex flex-col gap-2 border-t border-border p-3">
            {!started && (
              <div className="grid grid-cols-2 gap-2">
                <input className="min-h-10 rounded-theme border border-border bg-surface px-2 text-sm" placeholder={bn ? "নাম (ঐচ্ছিক)" : "Name (optional)"} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                <input className="min-h-10 rounded-theme border border-border bg-surface px-2 text-sm" placeholder={bn ? "ফোন (ঐচ্ছিক)" : "Phone (optional)"} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />
              </div>
            )}
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <textarea
                className="min-h-10 flex-1 resize-none rounded-theme border border-border bg-surface px-2 py-2 text-sm"
                rows={1}
                maxLength={2000}
                placeholder={bn ? "বার্তা লিখুন…" : "Type a message…"}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button type="button" disabled={sending || !text.trim()} onClick={() => void send()} className="min-h-10 rounded-theme bg-brand px-4 text-sm font-medium text-brand-foreground disabled:opacity-50">
                {bn ? "পাঠান" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
