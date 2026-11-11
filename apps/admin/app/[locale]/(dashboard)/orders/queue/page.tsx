"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { useCurrentStaff } from "../../../../../lib/use-current-staff";
import { Banner, Button, Card, Toggle } from "../../../../../components/ui";

interface QueueOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  codAmount: number;
  riskLevel: string;
  createdAt: string;
  billingContact: { name?: string; phone?: string } | null;
}
interface QueueStaff {
  id: string;
  name: string;
  email: string;
  takesOrderQueue: boolean;
  openCount: number;
}

function money(poisha: number) {
  return `৳${(poisha / 100).toFixed(0)}`;
}

/** "My queue" for call executives plus the team roster (docs/PROJECT_SPEC.md §8.2 Order queue, §16 M11). Who takes new orders is a per-person switch; round-robin vs least-load is a setting under Orders. */
export default function OrderQueuePage() {
  const t = useTranslations("queue");
  const tOrders = useTranslations("orders");
  const { hasPermission } = useCurrentStaff();
  const [mine, setMine] = useState<QueueOrder[]>([]);
  const [team, setTeam] = useState<QueueStaff[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Captured once per load so render stays pure; "waiting" is minute-granular anyway.
  const [loadedAt, setLoadedAt] = useState(0);
  const canManage = hasPermission("orders.queue.manage");

  const load = useCallback(async () => {
    try {
      setMine(await api.get<QueueOrder[]>("/admin/order-queue/mine"));
      setLoadedAt(Date.now());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load your queue");
    }
  }, []);

  const loadTeam = useCallback(async () => {
    try {
      setTeam(await api.get<QueueStaff[]>("/admin/order-queue/staff"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load the team");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount.
    void load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, permission-gated.
    if (canManage) void loadTeam();
  }, [canManage, loadTeam]);

  async function setParticipation(id: string, takesOrderQueue: boolean) {
    setError(null);
    try {
      await api.patch(`/admin/order-queue/staff/${id}`, { takesOrderQueue });
      await loadTeam();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
        </div>
        <Link href="/orders/kanban">
          <Button variant="secondary">{t("kanban")}</Button>
        </Link>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
              <th className="px-4 py-3">{tOrders("orderNumber")}</th>
              <th className="px-4 py-3">{tOrders("customer")}</th>
              <th className="px-4 py-3">{tOrders("status.label")}</th>
              <th className="px-4 py-3">{tOrders("risk")}</th>
              <th className="px-4 py-3">{tOrders("cod")}</th>
              <th className="px-4 py-3">{t("waiting")}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {mine.map((order) => {
              const minutes = Math.max(0, Math.round((loadedAt - new Date(order.createdAt).getTime()) / 60000));
              const phone = order.billingContact?.phone;
              return (
                <tr key={order.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/orders/${order.id}`} className="text-surface-foreground underline">
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-surface-foreground/70">{order.billingContact?.name ?? phone ?? "-"}</td>
                  <td className="px-4 py-3 text-surface-foreground/70">{tOrders(`status.${order.status}`)}</td>
                  <td className="px-4 py-3">
                    <span className={order.riskLevel === "high" ? "text-danger" : order.riskLevel === "medium" ? "text-warning" : "text-surface-foreground/70"}>{order.riskLevel}</span>
                  </td>
                  <td className="px-4 py-3 text-surface-foreground">{money(order.codAmount)}</td>
                  <td className="px-4 py-3 text-surface-foreground/70">{minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`}</td>
                  <td className="px-4 py-3">
                    {/* The masked phone (when field masking is on) isn't dialable, so the link only appears for a real number. */}
                    {phone && /^\+?\d+$/.test(phone) && (
                      <a href={`tel:${phone}`} className="text-brand underline">
                        {t("call")}
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
            {mine.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-surface-foreground/50" colSpan={7}>
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {canManage && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-surface-foreground">{t("teamTitle")}</h2>
          <p className="text-xs text-surface-foreground/60">{t("teamHelp")}</p>
          {team.map((member) => (
            <div key={member.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
              <div>
                <div className="text-sm font-medium text-surface-foreground">{member.name}</div>
                <div className="text-xs text-surface-foreground/60">
                  {member.email} · {t("open", { count: member.openCount })}
                </div>
              </div>
              <Toggle checked={member.takesOrderQueue} onChange={(value) => void setParticipation(member.id, value)} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
