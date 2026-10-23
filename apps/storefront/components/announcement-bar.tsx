import type { AnnouncementBar as AnnouncementBarData } from "../lib/store-api";

function text(value: { bn?: string; en?: string } | null | undefined, locale: string): string {
  if (!value) return "";
  return value[locale as "bn" | "en"] ?? value.bn ?? value.en ?? "";
}

/** Rotating announcement bar (docs/PROJECT_SPEC.md §7.2) — only ever shown within its own schedule window; see `AnnouncementsService.listActiveNow`. */
export function AnnouncementBar({ bars, locale }: { bars: AnnouncementBarData[]; locale: string }) {
  if (bars.length === 0) return null;
  const bar = bars[0]!; // rotation among several active bars is a reasonable future enhancement; the first one wins for now.
  const message = text(bar.message, locale);
  if (!message) return null;

  const content = (
    <span>
      {message}
      {bar.linkUrl && bar.linkText && <span className="ml-2 underline">{text(bar.linkText, locale)}</span>}
    </span>
  );

  return (
    <div className="bg-brand px-4 py-2 text-center text-xs font-medium text-brand-foreground">
      {bar.linkUrl ? <a href={bar.linkUrl}>{content}</a> : content}
    </div>
  );
}
