"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";
import { SupportTabs } from "../../../../../components/support-tabs";
import { CallButton } from "../../../../../components/call-button";
import { selectClass } from "../../../../../components/marketing-tabs";
import { Link } from "../../../../../i18n/navigation";

interface CallRow {
  id: string;
  driver: string;
  staffId: string | null;
  staffName: string | null;
  phone: string;
  status: string;
  durationSeconds: number | null;
  recordingUrl: string | null;
  orderId: string | null;
  conversationId: string | null;
  error: string | null;
  startedAt: string;
}

interface Status {
  provider: { id: string; name: string; driver: string } | null;
  myPhone: string | null;
}

function duration(seconds: number | null): string {
  if (seconds === null) return "—";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Click-to-call setup and call log (§8.2 call-centre tools, §16 M15). */
export default function CallsPage() {
  const t = useTranslations("calls");
  const [status, setStatus] = useState<Status | null>(null);
  const [myPhone, setMyPhone] = useState("");
  const [mine, setMine] = useState(true);
  const [rows, setRows] = useState<CallRow[]>([]);
  const [testNumber, setTestNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([api.get<Status>("/admin/support/calls/status"), api.get<{ items: CallRow[] }>(`/admin/support/calls?pageSize=50${mine ? "&mine=true" : ""}`)]);
      setStatus(s);
      setMyPhone((current) => current || s.myPhone || "");
      setRows(list.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [mine]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on filter change
    void load();
  }, [load]);

  async function savePhone() {
    setError(null);
    try {
      await api.put("/admin/support/calls/my-phone", { phone: myPhone.trim() || null });
      setNotice(t("phoneSaved"));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function outcome(id: string, value: string) {
    if (!value) return;
    try {
      await api.put(`/admin/support/calls/${id}/outcome`, { status: value, durationSeconds: null });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      <SupportTabs />
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      <Card className="flex flex-col gap-3">
        {status && (
          <p className="text-sm">
            {status.provider ? t("providerActive", { name: status.provider.name, driver: status.provider.driver }) : t("noProvider")}{" "}
            <Link href="/integrations" className="text-brand hover:underline">
              {t("integrations")}
            </Link>
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <TextField label={t("myPhone")} value={myPhone} onChange={(e) => setMyPhone(e.target.value)} placeholder="01XXXXXXXXX" />
          <Button variant="secondary" onClick={() => void savePhone()}>
            {t("save")}
          </Button>
        </div>
        <p className="text-xs text-surface-foreground/60">{t("myPhoneHelp")}</p>
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <TextField label={t("testNumber")} value={testNumber} onChange={(e) => setTestNumber(e.target.value)} placeholder="01XXXXXXXXX" />
          <CallButton phone={testNumber.trim() || null} />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <label className="flex items-center gap-2 self-start text-sm">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          {t("onlyMine")}
        </label>
        {rows.length === 0 && <p className="text-sm text-surface-foreground/60">{t("empty")}</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-foreground/60">
                  <th className="py-1">{t("when")}</th>
                  <th>{t("number")}</th>
                  <th>{t("agent")}</th>
                  <th>{t("status")}</th>
                  <th>{t("duration")}</th>
                  <th>{t("related")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="py-2 text-xs">{new Date(row.startedAt).toLocaleString()}</td>
                    <td>{row.phone}</td>
                    <td className="text-xs">{row.staffName ?? "—"}</td>
                    <td className="text-xs">
                      {t(`status_${row.status}`)}
                      {row.error && <span className="block text-danger">{row.error}</span>}
                      {row.driver === "tel" && row.status === "initiated" && (
                        <select className={`${selectClass} mt-1 block`} value="" onChange={(e) => void outcome(row.id, e.target.value)}>
                          <option value="">{t("setOutcome")}</option>
                          {["completed", "no_answer", "busy", "failed"].map((s) => (
                            <option key={s} value={s}>
                              {t(`status_${s}`)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="text-xs">
                      {duration(row.durationSeconds)}
                      {row.recordingUrl && (
                        <a href={row.recordingUrl} target="_blank" rel="noreferrer" className="ml-1 text-brand underline">
                          {t("recording")}
                        </a>
                      )}
                    </td>
                    <td className="text-xs">
                      {row.orderId && (
                        <Link href={`/orders/${row.orderId}`} className="text-brand hover:underline">
                          {t("order")}
                        </Link>
                      )}
                      {row.conversationId && (
                        <Link href={`/support/inbox?c=${row.conversationId}`} className="ml-1 text-brand hover:underline">
                          {t("conversation")}
                        </Link>
                      )}
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
