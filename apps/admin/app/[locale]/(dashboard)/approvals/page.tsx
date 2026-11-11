"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card } from "../../../../components/ui";

interface ApprovalRow {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  summary: string;
  status: "pending" | "approved" | "rejected" | "failed";
  requestedByName: string | null;
  decidedByName: string | null;
  decisionNote: string | null;
  error: string | null;
  createdAt: string;
}

const STATUSES = ["pending", "approved", "rejected", "failed"] as const;

/** Approval requests inbox (docs/PROJECT_SPEC.md §8.2 Staff & security, §16 M11). Approving replays the stored action as the requester; you can't approve your own request. */
export default function ApprovalsPage() {
  const t = useTranslations("approvals");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("pending");
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<ApprovalRow[]>(`/admin/approvals?status=${status}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load approvals");
    }
  }, [status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / filter change.
    void load();
  }, [load]);

  async function decide(id: string, action: "approve" | "reject") {
    const note = action === "reject" ? window.prompt(t("rejectNotePrompt")) : null;
    if (action === "reject" && note === null) return;
    setError(null);
    try {
      await api.post(`/admin/approvals/${id}/${action}`, { note: note || null });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="flex gap-2">
        {STATUSES.map((s) => (
          <Button key={s} variant={s === status ? "primary" : "secondary"} onClick={() => setStatus(s)}>
            {t(`status.${s}`)}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <Card key={row.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-surface-foreground">{t(`types.${row.type}`)}</span>
              <span className="text-xs text-surface-foreground/60">{new Date(row.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-sm text-surface-foreground">{row.summary}</p>
            <p className="text-xs text-surface-foreground/60">
              {t("requestedBy")}: {row.requestedByName ?? "-"}
              {row.decidedByName ? ` · ${t("decidedBy")}: ${row.decidedByName}` : ""}
              {row.decisionNote ? ` · ${row.decisionNote}` : ""}
            </p>
            {row.error && <Banner kind="error">{row.error}</Banner>}
            {row.status === "pending" && (
              <div className="flex gap-2">
                <Button onClick={() => void decide(row.id, "approve")}>{t("approve")}</Button>
                <Button variant="danger" onClick={() => void decide(row.id, "reject")}>
                  {t("reject")}
                </Button>
              </div>
            )}
          </Card>
        ))}
        {rows.length === 0 && <p className="text-sm text-surface-foreground/50">{t("empty")}</p>}
      </div>
    </div>
  );
}
