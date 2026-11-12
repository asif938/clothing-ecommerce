"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";
import { CustomerLoyaltyCard } from "../../../../../components/customer-loyalty-card";

interface CustomerProfile {
  customer: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    status: "active" | "blocked";
    tags: string[];
    notes: string | null;
    pointsBalance: number;
    storeCreditBalance: number;
    totalSpent: number;
    ordersCount: number;
    deliveredCount: number;
    rejectedAtDoorCount: number;
    riskScore: number;
  };
  orders: { id: string; orderNumber: string; status: string; total: number; createdAt: string }[];
  addresses: { id: string; label: string | null; addressLine: string; phone: string }[];
  reviews: { id: string; rating: number; title: string | null; status: string }[];
  returns: { id: string; type: string; status: string }[];
}

export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("customers");
  const tCommon = useTranslations("common");
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tagsInput, setTagsInput] = useState("");
  const [notes, setNotes] = useState("");
  const [mergeId, setMergeId] = useState("");

  async function load() {
    try {
      const result = await api.get<CustomerProfile>(`/admin/customers/${id}`);
      setProfile(result);
      setTagsInput(result.customer.tags.join(", "));
      setNotes(result.customer.notes ?? "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load customer");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-param-change
    void load();
  }, [id]);

  async function handleSave() {
    try {
      await api.patch(`/admin/customers/${id}`, { tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean), notes: notes || null });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  }

  async function handleBlock() {
    try {
      await api.post(`/admin/customers/${id}/block`, { reason: "Blocked from customer profile" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to block customer");
    }
  }

  async function handleMerge() {
    if (!mergeId) return;
    try {
      await api.post("/admin/customers/merge", { keepCustomerId: id, mergeCustomerId: mergeId });
      setMergeId("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to merge customers");
    }
  }

  if (!profile) return error ? <Banner kind="error">{error}</Banner> : <p className="text-sm text-surface-foreground/60">…</p>;

  const { customer, orders, addresses, reviews, returns } = profile;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-surface-foreground">{customer.name ?? customer.phone ?? customer.id}</h1>
        <Link href="/customers" className="text-sm text-brand hover:underline">{tCommon("back")}</Link>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs text-surface-foreground/60">{t("colSpent")}</p>
          <p className="text-xl font-semibold text-surface-foreground">৳{(customer.totalSpent / 100).toLocaleString()}</p>
        </Card>
        <Card>
          <p className="text-xs text-surface-foreground/60">{t("colOrders")}</p>
          <p className="text-xl font-semibold text-surface-foreground">{customer.ordersCount} ({t("delivered")}: {customer.deliveredCount})</p>
        </Card>
        <Card>
          <p className="text-xs text-surface-foreground/60">{t("riskScore")}</p>
          <p className="text-xl font-semibold text-surface-foreground">{customer.riskScore} · {t("rejectedAtDoor")}: {customer.rejectedAtDoorCount}</p>
        </Card>
        <Card>
          <p className="text-xs text-surface-foreground/60">{t("pointsBalance")}</p>
          <p className="text-xl font-semibold text-surface-foreground">{customer.pointsBalance}</p>
        </Card>
        <Card>
          <p className="text-xs text-surface-foreground/60">{t("storeCreditBalance")}</p>
          <p className="text-xl font-semibold text-surface-foreground">৳{(customer.storeCreditBalance / 100).toLocaleString()}</p>
        </Card>
        <Card>
          <p className="text-xs text-surface-foreground/60">{t("colStatus")}</p>
          <p className="text-xl font-semibold text-surface-foreground">{customer.status}</p>
        </Card>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="font-medium text-surface-foreground">{t("tagsAndNotes")}</h2>
        <TextField label={t("colTags")} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="vip, wholesale" />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("notes")}</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void handleSave()}>{tCommon("save")}</Button>
          {customer.status === "active" && <Button variant="danger" onClick={() => void handleBlock()}>{t("block")}</Button>}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-medium text-surface-foreground">{t("mergeDuplicate")}</h2>
        <div className="flex flex-wrap items-end gap-2">
          <TextField label={t("mergeCustomerId")} value={mergeId} onChange={(e) => setMergeId(e.target.value)} />
          <Button variant="secondary" onClick={() => void handleMerge()} disabled={!mergeId}>{t("merge")}</Button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-medium text-surface-foreground">{t("orders")}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {orders.map((o) => (
              <li key={o.id} className="flex justify-between border-b border-border py-1 last:border-b-0">
                <span className="text-surface-foreground">{o.orderNumber}</span>
                <span className="text-surface-foreground/60">{o.status} · ৳{(o.total / 100).toLocaleString()}</span>
              </li>
            ))}
            {orders.length === 0 && <li className="text-surface-foreground/50">—</li>}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-medium text-surface-foreground">{t("addresses")}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {addresses.map((a) => (
              <li key={a.id} className="border-b border-border py-1 last:border-b-0 text-surface-foreground/70">{a.label ? `${a.label}: ` : ""}{a.addressLine}</li>
            ))}
            {addresses.length === 0 && <li className="text-surface-foreground/50">—</li>}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-medium text-surface-foreground">{t("reviews")}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {reviews.map((r) => (
              <li key={r.id} className="border-b border-border py-1 last:border-b-0 text-surface-foreground/70">{r.rating}★ {r.title ?? ""} ({r.status})</li>
            ))}
            {reviews.length === 0 && <li className="text-surface-foreground/50">—</li>}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-medium text-surface-foreground">{t("returns")}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {returns.map((r) => (
              <li key={r.id} className="border-b border-border py-1 last:border-b-0 text-surface-foreground/70">{r.type} ({r.status})</li>
            ))}
            {returns.length === 0 && <li className="text-surface-foreground/50">—</li>}
          </ul>
        </Card>
      </div>
      <CustomerLoyaltyCard customerId={id} />
    </div>
  );
}
