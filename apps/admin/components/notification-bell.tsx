"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../lib/api";

interface StaffNotificationRow {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Staff in-app bell (docs/PROJECT_SPEC.md §16 M7: "staff notifications
 * (in-app + email)"). Polls every 30s rather than a websocket/SSE push —
 * the simplest thing that works for a handful of staff on a free-tier
 * single-instance deployment (golden rule 8); re-polls on open too, so the
 * unread count is never more than 30s stale while the panel is closed.
 */
export function NotificationBell() {
  const t = useTranslations("shell");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StaffNotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  async function load() {
    try {
      const result = await api.get<{ items: StaffNotificationRow[]; unreadCount: number }>("/staff/notifications?pageSize=10");
      setItems(result.items);
      setUnreadCount(result.unreadCount);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount + poll
    void load();
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, []);

  async function handleMarkAllRead() {
    await api.post("/staff/notifications/read-all");
    await load();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex w-full items-center gap-2 rounded-theme px-2 py-1.5 text-left text-sm text-surface-foreground/70 hover:bg-muted hover:text-surface-foreground"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        <span>{t("notificationsBell")}</span>
        {unreadCount > 0 && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-white">{unreadCount}</span>
        )}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-10 mb-2 w-72 rounded-theme border border-border bg-surface p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-xs font-medium text-surface-foreground/70">
              {unreadCount} {t("notificationsUnread")}
            </span>
            <button type="button" onClick={() => void handleMarkAllRead()} className="text-xs text-brand">
              {t("notificationsMarkAllRead")}
            </button>
          </div>
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {items.length === 0 && <p className="px-2 py-4 text-center text-xs text-surface-foreground/50">{t("notificationsEmpty")}</p>}
            {items.map((item) => (
              <div key={item.id} className={`rounded-theme p-2 text-xs ${item.readAt ? "" : "bg-muted"}`}>
                <div className="font-medium text-surface-foreground">{item.title}</div>
                <div className="text-surface-foreground/70">{item.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
