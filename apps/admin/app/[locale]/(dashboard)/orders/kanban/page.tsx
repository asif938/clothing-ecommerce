"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";

interface KanbanCard {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  riskLevel: string;
  tags: string[];
  assignedTo: string | null;
  createdAt: string;
  billingContact: { name?: string; phone?: string } | null;
  _count: { items: number };
}
interface Column {
  status: string;
  count: number;
  cards: KanbanCard[];
}

/** Statuses a card may be dropped on, because `POST /admin/orders/:id/transition` accepts them. Later steps (packed, shipped…) belong to the fulfillment screens. */
const DROPPABLE = new Set(["pending", "confirmed", "on_hold", "processing"]);

function money(poisha: number) {
  return `৳${(poisha / 100).toFixed(0)}`;
}

/** Kanban view by status (docs/PROJECT_SPEC.md §8.2 Orders, §16 M11). Dragging a card calls the same server-validated transition as the detail page - an illegal move simply comes back as an error and the board reloads. */
export default function KanbanPage() {
  const t = useTranslations("kanban");
  const tOrders = useTranslations("orders");
  const router = useRouter();
  const [columns, setColumns] = useState<Column[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<KanbanCard | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [holdFor, setHoldFor] = useState<{ card: KanbanCard; to: string } | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await api.get<{ columns: Column[] }>("/admin/order-queue/kanban");
      setColumns(result.columns);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load board");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount.
    void load();
  }, [load]);

  async function move(card: KanbanCard, to: string, moveReason: string | null) {
    setError(null);
    try {
      await api.post(`/admin/orders/${card.id}/transition`, { to, reason: moveReason });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Move failed");
    }
    await load();
  }

  function handleDrop(to: string) {
    const card = dragging;
    setDragging(null);
    setOverColumn(null);
    if (!card || card.status === to || !DROPPABLE.has(to)) return;
    if (to === "on_hold") {
      setHoldFor({ card, to });
      setReason("");
      return;
    }
    void move(card, to, null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/orders">
            <Button variant="secondary">{t("listView")}</Button>
          </Link>
          <Link href="/orders/queue">
            <Button variant="secondary">{t("myQueue")}</Button>
          </Link>
        </div>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      {holdFor && (
        <Card className="flex items-end gap-2">
          <TextField label={t("holdReason")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button
            disabled={!reason.trim()}
            onClick={() => {
              const target = holdFor;
              setHoldFor(null);
              void move(target.card, target.to, reason.trim());
            }}
          >
            {t("putOnHold")}
          </Button>
          <Button variant="secondary" onClick={() => setHoldFor(null)}>
            {t("cancel")}
          </Button>
        </Card>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div
            key={column.status}
            onDragOver={(e) => {
              if (DROPPABLE.has(column.status)) {
                e.preventDefault();
                setOverColumn(column.status);
              }
            }}
            onDragLeave={() => setOverColumn((current) => (current === column.status ? null : current))}
            onDrop={() => handleDrop(column.status)}
            className={`flex w-64 shrink-0 flex-col gap-2 rounded-theme border bg-muted/40 p-2 ${overColumn === column.status ? "border-brand" : "border-border"}`}
          >
            <div className="flex items-center justify-between px-1 text-sm font-semibold text-surface-foreground">
              <span>{tOrders(`status.${column.status}`)}</span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs">{column.count}</span>
            </div>
            {column.cards.map((card) => (
              <div
                key={card.id}
                draggable={DROPPABLE.has(card.status)}
                onDragStart={() => setDragging(card)}
                onDragEnd={() => setDragging(null)}
                onClick={() => router.push(`/orders/${card.id}`)}
                className="cursor-pointer rounded-theme border border-border bg-surface p-2 text-sm hover:border-brand"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-surface-foreground">{card.orderNumber}</span>
                  <span className="text-surface-foreground">{money(card.total)}</span>
                </div>
                <div className="truncate text-xs text-surface-foreground/70">{card.billingContact?.name ?? card.billingContact?.phone ?? "-"}</div>
                <div className="mt-1 flex flex-wrap gap-1 text-xs">
                  <span className="text-surface-foreground/60">
                    {card._count.items} {t("items")}
                  </span>
                  {card.riskLevel !== "low" && <span className={card.riskLevel === "high" ? "text-danger" : "text-warning"}>{card.riskLevel}</span>}
                  {card.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="rounded bg-muted px-1">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {column.count > column.cards.length && (
              <Link href={`/orders?status=${column.status}`} className="px-1 text-xs text-brand underline">
                {t("showAll", { count: column.count })}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
