"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../../lib/api";
import { money } from "../../../../../../lib/format";
import { useCurrentStaff } from "../../../../../../lib/use-current-staff";
import { Banner, Button, Card, TextField } from "../../../../../../components/ui";
import { MarketingTabs, selectClass } from "../../../../../../components/marketing-tabs";
import { BroadcastComposer, type BroadcastForm } from "../../../../../../components/broadcast-composer";
import { Link, useRouter } from "../../../../../../i18n/navigation";

interface Report {
  broadcast: BroadcastForm & { id: string; status: string; scheduledAt: string | null; startedAt: string | null; completedAt: string | null; recipientEstimate: number; estimatedCost: number; queuedCount: number; lastError: string | null };
  delivery: Record<string, number>;
  codes: { prefix: string; issued: number; redeemed: number; discountGiven: number; orderRevenue: number } | null;
}

interface Preview {
  recipient: { name: string | null; locale: string } | null;
  bn: { subject: string | null; body: string };
  en: { subject: string | null; body: string };
}

/** One broadcast: edit (draft), preview, test send, schedule/cancel, delivery + code redemption report. */
export default function BroadcastDetailPage() {
  const t = useTranslations("broadcasts");
  const tCommon = useTranslations("common");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { staff } = useCurrentStaff();
  const [report, setReport] = useState<Report | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testLocale, setTestLocale] = useState<"bn" | "en">("bn");
  const [scheduleAt, setScheduleAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canSend = Boolean(staff?.permissions.includes("marketing.broadcasts.send"));

  const load = useCallback(async () => {
    try {
      const r = await api.get<Report>(`/admin/marketing/broadcasts/${id}`);
      setReport(r);
      setPreview(await api.get<Preview>(`/admin/marketing/broadcasts/${id}/preview`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  // While sending, refresh the counters.
  useEffect(() => {
    if (report?.broadcast.status !== "sending" && report?.broadcast.status !== "scheduled") return;
    const handle = setInterval(() => void load(), 10_000);
    return () => clearInterval(handle);
  }, [report?.broadcast.status, load]);

  async function run(fn: () => Promise<unknown>, success?: string) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (success) setNotice(success);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  if (!report) return <div className="flex flex-col gap-4">{error ? <Banner kind="error">{error}</Banner> : <p className="text-sm">{tCommon("loading")}</p>}</div>;
  const b = report.broadcast;

  return (
    <div className="flex flex-col gap-6">
      <MarketingTabs />
      <Link href="/marketing/broadcasts" className="text-sm text-surface-foreground/60 hover:underline">
        ← {t("title")}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{b.name}</h1>
        <p className="text-sm text-surface-foreground/60">
          {t(`channel_${b.channel}`)} · {t(`status_${b.status}`)}
          {b.scheduledAt ? ` · ${new Date(b.scheduledAt).toLocaleString()}` : ""}
        </p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}
      {b.lastError && <Banner kind="warning">{b.lastError}</Banner>}

      {b.status !== "draft" && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            [t("recipients"), `${b.queuedCount} / ${b.recipientEstimate}`],
            [t("cost"), money(b.estimatedCost)],
            [t("delivered"), String(report.delivery.sent ?? 0)],
            [t("pendingSend"), String((report.delivery.queued ?? 0) + (report.delivery.retrying ?? 0))],
            [t("failed"), String(report.delivery.failed ?? 0)],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <p className="text-xs text-surface-foreground/60">{label}</p>
              <p className="text-xl font-semibold text-surface-foreground">{value}</p>
            </Card>
          ))}
        </div>
      )}

      {report.codes && (
        <Card className="flex flex-col gap-1 text-sm">
          <h2 className="font-medium text-surface-foreground">{t("codesReport")}</h2>
          <p>{t("codesLine", { prefix: report.codes.prefix, issued: report.codes.issued, redeemed: report.codes.redeemed })}</p>
          <p>{t("codesRevenue", { revenue: money(report.codes.orderRevenue), discount: money(report.codes.discountGiven) })}</p>
        </Card>
      )}

      {preview && (
        <Card className="flex flex-col gap-2">
          <h2 className="font-medium text-surface-foreground">{t("preview")}</h2>
          {preview.recipient && <p className="text-xs text-surface-foreground/60">{t("previewFor", { name: preview.recipient.name ?? "—" })}</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {(["bn", "en"] as const).map((loc) => (
              <div key={loc} className="whitespace-pre-wrap rounded-theme bg-muted p-3 text-sm text-surface-foreground">
                {preview[loc].subject && <p className="mb-1 font-medium">{preview[loc].subject}</p>}
                {preview[loc].body}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="flex flex-wrap items-end gap-2">
        <TextField label={b.channel === "email" ? t("testEmail") : t("testPhone")} value={testTo} onChange={(e) => setTestTo(e.target.value)} />
        <select className={selectClass} value={testLocale} onChange={(e) => setTestLocale(e.target.value as "bn" | "en")}>
          <option value="bn">বাংলা</option>
          <option value="en">English</option>
        </select>
        <Button variant="secondary" disabled={!testTo || b.channel === "push"} onClick={() => void run(() => api.post(`/admin/marketing/broadcasts/${id}/test`, { to: testTo, locale: testLocale }), t("testSent"))}>
          {t("sendTest")}
        </Button>
      </Card>

      {canSend && b.status === "draft" && (
        <Card className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-surface-foreground">{t("scheduleAt")}</span>
            <input type="datetime-local" className={selectClass} value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          </label>
          <Button onClick={() => void run(() => api.post(`/admin/marketing/broadcasts/${id}/schedule`, { scheduledAt: scheduleAt ? new Date(scheduleAt).toISOString() : null }), t("scheduled"))}>{scheduleAt ? t("schedule") : t("sendNow")}</Button>
          <span className="text-xs text-surface-foreground/60">{t("scheduleHelp")}</span>
        </Card>
      )}
      {canSend && (b.status === "scheduled" || b.status === "sending") && (
        <Button variant="danger" className="self-start" onClick={() => void run(() => api.post(`/admin/marketing/broadcasts/${id}/cancel`))}>
          {b.status === "scheduled" ? t("unschedule") : t("cancelSending")}
        </Button>
      )}

      {b.status === "draft" && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium text-surface-foreground">{tCommon("edit")}</h2>
          <BroadcastComposer
            initial={{ name: b.name, channel: b.channel, segmentId: b.segmentId, subjectBn: b.subjectBn, subjectEn: b.subjectEn, bodyBn: b.bodyBn, bodyEn: b.bodyEn, discountId: b.discountId, codePrefix: b.codePrefix }}
            onSave={async (form) => {
              await api.put(`/admin/marketing/broadcasts/${id}`, form);
              setNotice(t("saved"));
              await load();
            }}
            saveLabel={tCommon("save")}
          />
          <Button
            variant="danger"
            className="self-start"
            onClick={() =>
              void run(async () => {
                await api.delete(`/admin/marketing/broadcasts/${id}`);
                router.push("/marketing/broadcasts");
              })
            }
          >
            {tCommon("delete")}
          </Button>
        </Card>
      )}
    </div>
  );
}
