"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../components/ui";

interface PriceSchedule {
  id: string;
  targetType: string;
  targetId: string;
  newPrice: number | null;
  percentChange: number | null;
  startsAt: string;
  endsAt: string | null;
  status: string;
}

const TARGET_TYPES = ["variant", "product", "collection", "category", "tag"] as const;

export default function PriceSchedulesPage() {
  const t = useTranslations("priceSchedules");
  const tCommon = useTranslations("common");
  const [schedules, setSchedules] = useState<PriceSchedule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<(typeof TARGET_TYPES)[number]>("variant");
  const [targetId, setTargetId] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [percentChange, setPercentChange] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  async function load() {
    try {
      setSchedules(await api.get<PriceSchedule[]>("/admin/price-schedules"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load price schedules");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  async function handleCreate() {
    try {
      await api.post("/admin/price-schedules", {
        targetType,
        targetId,
        newPrice: newPrice ? Number(newPrice) : null,
        percentChange: percentChange ? Number(percentChange) : null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });
      setTargetId("");
      setNewPrice("");
      setPercentChange("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create price schedule");
    }
  }

  async function handleCancel(id: string) {
    try {
      await api.delete(`/admin/price-schedules/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="flex items-center justify-between rounded-theme border border-border px-3 py-2 text-sm">
              <span>
                {schedule.targetType}:{schedule.targetId} — {schedule.newPrice !== null ? schedule.newPrice : `${schedule.percentChange}%`} ({schedule.status})
              </span>
              {schedule.status !== "cancelled" && schedule.status !== "ended" && (
                <button onClick={() => void handleCancel(schedule.id)} className="text-xs text-danger">
                  {t("cancel")}
                </button>
              )}
            </li>
          ))}
          {schedules.length === 0 && <li className="text-sm text-surface-foreground/50">—</li>}
        </ul>

        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-surface-foreground">{t("targetType")}</span>
            <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" value={targetType} onChange={(e) => setTargetType(e.target.value as (typeof TARGET_TYPES)[number])}>
              {TARGET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <TextField label={t("targetId")} value={targetId} onChange={(e) => setTargetId(e.target.value)} />
          <TextField label={t("newPrice")} type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
          <TextField label={t("percentChange")} type="number" value={percentChange} onChange={(e) => setPercentChange(e.target.value)} />
          <TextField label={t("startsAt")} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          <TextField label={t("endsAt")} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          <Button onClick={() => void handleCreate()} disabled={!targetId || !startsAt || (!newPrice && !percentChange)}>
            {tCommon("create")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
