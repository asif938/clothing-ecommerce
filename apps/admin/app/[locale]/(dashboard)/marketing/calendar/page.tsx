"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { localized } from "../../../../../lib/format";
import { Banner, Button, Card } from "../../../../../components/ui";
import { MarketingTabs } from "../../../../../components/marketing-tabs";
import { Link } from "../../../../../i18n/navigation";

interface CalendarEvent {
  id: string;
  kind: "discount" | "flash_sale" | "announcement" | "popup" | "price_schedule" | "broadcast" | "page";
  title: string | { bn?: string; en?: string };
  start: string;
  end: string | null;
  status: string;
  link: string;
}

const KIND_COLORS: Record<CalendarEvent["kind"], string> = {
  discount: "bg-brand/20 text-surface-foreground",
  flash_sale: "bg-danger/20 text-surface-foreground",
  announcement: "bg-warning/20 text-surface-foreground",
  popup: "bg-warning/10 text-surface-foreground",
  price_schedule: "bg-success/20 text-surface-foreground",
  broadcast: "bg-muted text-surface-foreground",
  page: "bg-muted text-surface-foreground",
};

/** Dhaka calendar day key for a date. */
function dayKey(date: Date): string {
  return new Date(date.getTime() + 6 * 3_600_000).toISOString().slice(0, 10);
}

/** Promo calendar (§8.2 Marketing "Promo calendar", §16 M13): everything scheduled, month by month. */
export default function PromoCalendarPage() {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const from = new Date(month.getTime() - 6 * 3_600_000);
    const to = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1) - 6 * 3_600_000 - 1);
    return { from, to };
  }, [month]);

  const load = useCallback(async () => {
    try {
      setEvents(await api.get<CalendarEvent[]>(`/admin/marketing/calendar?from=${range.from.toISOString()}&to=${range.to.toISOString()}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [range]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on month change
    void load();
  }, [load]);

  const days = useMemo(() => {
    const count = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
    const leading = month.getUTCDay();
    return [...Array<null>(leading).fill(null), ...Array.from({ length: count }, (_, i) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), i + 1)))];
  }, [month]);

  function eventsOn(day: Date): CalendarEvent[] {
    const key = day.toISOString().slice(0, 10);
    return events.filter((e) => {
      const start = dayKey(new Date(e.start));
      const end = e.end ? dayKey(new Date(e.end)) : start;
      return start <= key && key <= end;
    });
  }

  const shift = (delta: number) => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + delta, 1)));
  const title = (e: CalendarEvent) => (typeof e.title === "string" ? e.title : localized(e.title, locale));

  return (
    <div className="flex flex-col gap-6">
      <MarketingTabs />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => shift(-1)}>
            ←
          </Button>
          <span className="min-w-36 text-center font-medium">{month.toLocaleDateString(locale === "bn" ? "bn-BD" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
          <Button variant="secondary" onClick={() => shift(1)}>
            →
          </Button>
        </div>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      <div className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(KIND_COLORS) as CalendarEvent["kind"][]).map((k) => (
          <span key={k} className={`rounded-theme px-2 py-1 ${KIND_COLORS[k]}`}>
            {t(`kind_${k}`)}
          </span>
        ))}
      </div>
      <Card className="overflow-x-auto p-2">
        <div className="grid min-w-[700px] grid-cols-7 gap-1">
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <div key={d} className="p-1 text-center text-xs font-medium text-surface-foreground/60">
              {new Date(Date.UTC(2026, 10, 1 + d)).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-US", { weekday: "short", timeZone: "UTC" })}
            </div>
          ))}
          {days.map((day, i) => (
            <div key={i} className="min-h-24 rounded-theme border border-border p-1">
              {day && (
                <>
                  <p className="text-xs text-surface-foreground/60">{day.getUTCDate()}</p>
                  <div className="flex flex-col gap-0.5">
                    {eventsOn(day)
                      .slice(0, 4)
                      .map((e) => (
                        <Link key={`${e.kind}-${e.id}`} href={e.link} title={`${t(`kind_${e.kind}`)}: ${title(e)} (${e.status})`} className={`truncate rounded px-1 text-[11px] ${KIND_COLORS[e.kind]}`}>
                          {title(e)}
                        </Link>
                      ))}
                    {eventsOn(day).length > 4 && <span className="text-[11px] text-surface-foreground/50">+{eventsOn(day).length - 4}</span>}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 font-medium text-surface-foreground">{t("list")}</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {events.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="flex flex-wrap justify-between gap-2 border-b border-border py-1 last:border-b-0">
              <Link href={e.link} className="text-brand hover:underline">
                {t(`kind_${e.kind}`)}: {title(e)}
              </Link>
              <span className="text-xs text-surface-foreground/60">
                {new Date(e.start).toLocaleString()}
                {e.end ? ` → ${new Date(e.end).toLocaleString()}` : ""} · {e.status}
              </span>
            </li>
          ))}
          {events.length === 0 && <li className="text-surface-foreground/50">{t("empty")}</li>}
        </ul>
      </Card>
    </div>
  );
}
