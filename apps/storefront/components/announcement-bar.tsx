import { t } from "@clothing/shared";
import type { AnnouncementBar as AnnouncementBarData } from "../lib/store-api";

/** Rotating announcement bar (docs/PROJECT_SPEC.md §7.2) — only ever shown within its own schedule window; see `AnnouncementsService.listActiveNow`. */
export function AnnouncementBar({ bars, locale }: { bars: AnnouncementBarData[]; locale: string }) {
  if (bars.length === 0) return null;
  const bar = bars[0]!; // rotation among several active bars is a reasonable future enhancement; the first one wins for now.
  const message = t(bar.message, locale as "bn" | "en");
  if (!message) return null;

  const content = (
    <span>
      {message}
      {bar.linkUrl && bar.linkText && <span className="ml-2 underline">{t(bar.linkText, locale as "bn" | "en")}</span>}
    </span>
  );

  return (
    <div className="bg-brand px-4 py-2 text-center text-xs font-medium text-brand-foreground">
      {bar.linkUrl ? <a href={bar.linkUrl}>{content}</a> : content}
    </div>
  );
}
