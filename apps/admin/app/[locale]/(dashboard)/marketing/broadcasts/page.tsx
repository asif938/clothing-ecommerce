"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { money } from "../../../../../lib/format";
import { Banner, Button, Card } from "../../../../../components/ui";
import { MarketingTabs } from "../../../../../components/marketing-tabs";
import { BroadcastComposer, EMPTY_BROADCAST, type BroadcastForm } from "../../../../../components/broadcast-composer";
import { Link, useRouter } from "../../../../../i18n/navigation";

interface Broadcast {
  id: string;
  name: string;
  channel: string;
  status: string;
  scheduledAt: string | null;
  recipientEstimate: number;
  estimatedCost: number;
  queuedCount: number;
  createdAt: string;
}

/** SMS/WhatsApp/email/push broadcasts to segments (§8.2 Marketing "Campaigns", §16 M13). */
export default function BroadcastsPage() {
  const t = useTranslations("broadcasts");
  const router = useRouter();
  const [rows, setRows] = useState<Broadcast[]>([]);
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<Broadcast[]>("/admin/marketing/broadcasts"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  async function create(form: BroadcastForm) {
    const created = await api.post<{ id: string }>("/admin/marketing/broadcasts", form);
    router.push(`/marketing/broadcasts/${created.id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <MarketingTabs />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setComposing(!composing)}>{composing ? t("close") : t("new")}</Button>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {composing && (
        <Card>
          <BroadcastComposer initial={EMPTY_BROADCAST} onSave={create} saveLabel={t("saveDraft")} />
        </Card>
      )}
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-surface-foreground/60">
              <th className="py-1">{t("name")}</th>
              <th>{t("channel")}</th>
              <th>{t("status")}</th>
              <th>{t("scheduledAt")}</th>
              <th>{t("recipients")}</th>
              <th>{t("cost")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t border-border">
                <td className="py-2">
                  <Link href={`/marketing/broadcasts/${b.id}`} className="text-brand hover:underline">
                    {b.name}
                  </Link>
                </td>
                <td>{t(`channel_${b.channel}`)}</td>
                <td>{t(`status_${b.status}`)}</td>
                <td>{b.scheduledAt ? new Date(b.scheduledAt).toLocaleString() : "—"}</td>
                <td>{b.status === "draft" ? "—" : `${b.queuedCount} / ${b.recipientEstimate}`}</td>
                <td>{b.status === "draft" ? "—" : money(b.estimatedCost)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-surface-foreground/50">
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
