"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../../../i18n/navigation";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Card } from "../../../../components/ui";

interface ReturnRow {
  id: string;
  type: string;
  status: string;
  reasonCode: string | null;
  createdAt: string;
  order: { orderNumber: string };
  customer: { name: string | null; phone: string | null } | null;
}

export default function ReturnsPage() {
  const t = useTranslations("returns");
  const router = useRouter();
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<ReturnRow[]>("/admin/returns")
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
              <th className="px-4 py-3">{t("order")}</th>
              <th className="px-4 py-3">{t("customer")}</th>
              <th className="px-4 py-3">{t("type")}</th>
              <th className="px-4 py-3">{t("status")}</th>
              <th className="px-4 py-3">{t("reason")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted" onClick={() => router.push(`/returns/${r.id}`)}>
                <td className="px-4 py-3 text-surface-foreground">{r.order.orderNumber}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{r.customer?.name ?? r.customer?.phone ?? "—"}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{t(`types.${r.type}`)}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{t(`statuses.${r.status}`)}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{r.reasonCode ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-surface-foreground/50" colSpan={5}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
