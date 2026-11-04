"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "../../../../i18n/navigation";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Card, TextField } from "../../../../components/ui";

interface CustomerRow {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  tags: string[];
  status: "active" | "blocked";
  totalSpent: number;
  ordersCount: number;
  riskScore: number;
}

export default function CustomersPage() {
  const t = useTranslations("customers");
  const router = useRouter();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ pageSize: "50" });
    if (search) params.set("search", search);
    api
      .get<{ items: CustomerRow[]; total: number }>(`/admin/customers?${params.toString()}`)
      .then((result) => {
        setRows(result.items);
        setTotal(result.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load customers"));
  }, [search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <Link href="/segments" className="text-sm text-brand hover:underline">{t("manageSegments")}</Link>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      <TextField label={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchPlaceholder")} />
      <Card className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-surface-foreground/60">—</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
                <th className="py-2 pr-4">{t("colName")}</th>
                <th className="py-2 pr-4">{t("colPhone")}</th>
                <th className="py-2 pr-4">{t("colOrders")}</th>
                <th className="py-2 pr-4">{t("colSpent")}</th>
                <th className="py-2 pr-4">{t("colStatus")}</th>
                <th className="py-2 pr-4">{t("colTags")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted" onClick={() => router.push(`/customers/${row.id}`)}>
                  <td className="py-2 pr-4 text-surface-foreground">{row.name ?? "—"}</td>
                  <td className="py-2 pr-4 text-surface-foreground/70">{row.phone ?? row.email ?? "—"}</td>
                  <td className="py-2 pr-4">{row.ordersCount}</td>
                  <td className="py-2 pr-4">৳{(row.totalSpent / 100).toLocaleString()}</td>
                  <td className="py-2 pr-4">{row.status}</td>
                  <td className="py-2 pr-4 text-xs text-surface-foreground/60">{row.tags.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="text-xs text-surface-foreground/50">{t("total", { count: total })}</p>
    </div>
  );
}
