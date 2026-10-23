"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Button, Card, TextField, Toggle } from "../../../../../components/ui";

interface Announcement {
  id: string;
  message: { bn?: string; en?: string };
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
}

export default function AnnouncementsPage() {
  const t = useTranslations("cms");
  const tCommon = useTranslations("common");
  const [items, setItems] = useState<Announcement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [messageEn, setMessageEn] = useState("");
  const [messageBn, setMessageBn] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  async function load() {
    try {
      setItems(await api.get<Announcement[]>("/admin/cms/announcements"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load announcements");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  async function handleCreate() {
    try {
      await api.post("/admin/cms/announcements", {
        message: { en: messageEn, bn: messageBn || undefined },
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });
      setMessageEn("");
      setMessageBn("");
      setStartsAt("");
      setEndsAt("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create announcement");
    }
  }

  async function toggleActive(item: Announcement) {
    try {
      await api.patch(`/admin/cms/announcements/${item.id}`, { isActive: !item.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update");
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/admin/cms/announcements/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("announcementsTitle")}</h1>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between rounded-theme border border-border px-3 py-2 text-sm">
              <div>
                <div>{item.message.en ?? item.message.bn}</div>
                <div className="text-xs text-surface-foreground/50">
                  {item.startsAt ? new Date(item.startsAt).toLocaleString() : "—"} → {item.endsAt ? new Date(item.endsAt).toLocaleString() : "—"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Toggle checked={item.isActive} onChange={() => void toggleActive(item)} />
                <button onClick={() => void handleDelete(item.id)} className="text-xs text-danger">
                  {tCommon("delete")}
                </button>
              </div>
            </li>
          ))}
          {items.length === 0 && <li className="text-sm text-surface-foreground/50">—</li>}
        </ul>

        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <TextField label="Message (en)" value={messageEn} onChange={(e) => setMessageEn(e.target.value)} />
          <TextField label="Message (bn)" value={messageBn} onChange={(e) => setMessageBn(e.target.value)} />
          <TextField label={t("scheduleAt")} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          <TextField label={t("endsAt")} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          <Button onClick={() => void handleCreate()} disabled={!messageEn}>
            {tCommon("create")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
