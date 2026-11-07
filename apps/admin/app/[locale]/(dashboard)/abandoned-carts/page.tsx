"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Card } from "../../../../components/ui";

interface AbandonedCartItem {
  addedPrice: number;
  quantity: number;
}
interface AbandonedCart {
  id: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  recoverySequenceStep: number;
  abandonedAt: string | null;
  recoveredAt: string | null;
  items: AbandonedCartItem[];
  customer: { name: string | null; phone: string | null } | null;
}

function formatBdt(poisha: number): string {
  return `৳${(poisha / 100).toLocaleString("en-US")}`;
}

/** §16 M10 — read-only visibility into the abandoned-cart recovery sweep; the sequence config itself lives in Settings → marketing. */
export default function AbandonedCartsPage() {
  const t = useTranslations("abandonedCarts");
  const tCommon = useTranslations("common");
  const [carts, setCarts] = useState<AbandonedCart[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AbandonedCart[]>("/admin/abandoned-carts")
      .then(setCarts)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      <Card>
        {!carts ? (
          <p className="text-sm text-surface-foreground/60">{tCommon("loading")}</p>
        ) : carts.length === 0 ? (
          <p className="text-sm text-surface-foreground/60">{t("noCarts")}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
                <th className="px-2 py-2">{t("contact")}</th>
                <th className="px-2 py-2">{t("total")}</th>
                <th className="px-2 py-2">{t("step")}</th>
                <th className="px-2 py-2">{t("abandonedAt")}</th>
                <th className="px-2 py-2">{t("recoveredAt")}</th>
              </tr>
            </thead>
            <tbody>
              {carts.map((cart) => (
                <tr key={cart.id} className="border-b border-border last:border-0">
                  <td className="px-2 py-2">{cart.contactName ?? cart.customer?.name ?? "—"} · {cart.contactPhone ?? cart.customer?.phone ?? cart.contactEmail ?? "—"}</td>
                  <td className="px-2 py-2">{formatBdt(cart.items.reduce((sum, i) => sum + i.addedPrice * i.quantity, 0))}</td>
                  <td className="px-2 py-2">{cart.recoverySequenceStep} / 3</td>
                  <td className="px-2 py-2">{cart.abandonedAt ? new Date(cart.abandonedAt).toLocaleString() : "—"}</td>
                  <td className="px-2 py-2">{cart.recoveredAt ? new Date(cart.recoveredAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
