"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Card } from "../../../../components/ui";

interface AuditLogRow {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export default function AuditPage() {
  const t = useTranslations("audit");
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ items: AuditLogRow[] }>("/admin/audit-logs")
      .then((result) => setRows(result.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load audit log"));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && (
        <div className="mt-4">
          <Banner kind="error">{error}</Banner>
        </div>
      )}
      <Card className="mt-6 overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-surface-foreground/60">{t("noChanges")}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Actor</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Entity</th>
                <th className="py-2 pr-4">Before → After</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0">
                  <td className="py-2 pr-4 whitespace-nowrap text-surface-foreground/70">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="py-2 pr-4">{row.actorType}{row.actorId ? `:${row.actorId.slice(0, 8)}` : ""}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{row.action}</td>
                  <td className="py-2 pr-4">{row.entityType}{row.entityId ? `:${row.entityId.slice(0, 8)}` : ""}</td>
                  <td className="max-w-xs truncate py-2 pr-4 font-mono text-xs text-surface-foreground/60">
                    {JSON.stringify(row.before)} → {JSON.stringify(row.after)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
