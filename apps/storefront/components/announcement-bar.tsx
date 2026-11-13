import { t } from "@clothing/shared";
import type { AnnouncementBar as AnnouncementBarData } from "../lib/store-api";
import { ExperimentSwitch } from "./experiment-switch";

type LocalizedText = { bn?: string; en?: string };

function BarContent({ message, linkText, linkUrl, locale }: { message: LocalizedText; linkText: LocalizedText | null; linkUrl: string | null; locale: string }) {
  const text = t(message, locale as "bn" | "en");
  if (!text) return null;
  const content = (
    <span>
      {text}
      {linkUrl && linkText && <span className="ml-2 underline">{t(linkText, locale as "bn" | "en")}</span>}
    </span>
  );
  return <div className="bg-brand px-4 py-2 text-center text-xs font-medium text-brand-foreground">{linkUrl ? <a href={linkUrl}>{content}</a> : content}</div>;
}

/**
 * Rotating announcement bar (docs/PROJECT_SPEC.md §7.2) — only ever shown within its own schedule window; see `AnnouncementsService.listActiveNow`.
 * §16 M14: a bar under an A/B test renders each variant's text and lets `ExperimentSwitch` show the visitor's one.
 */
export function AnnouncementBar({ bars, locale }: { bars: AnnouncementBarData[]; locale: string }) {
  if (bars.length === 0) return null;
  const bar = bars[0]!; // rotation among several active bars is a reasonable future enhancement; the first one wins for now.
  const control = <BarContent message={bar.message} linkText={bar.linkText} linkUrl={bar.linkUrl} locale={locale} />;
  if (!bar.experiment) return control;

  const variants = bar.experiment.variants.map((variant) => ({
    key: variant.key,
    node: variant.payload ? (
      <BarContent
        message={variant.payload.message}
        linkText={variant.payload.linkText !== undefined ? variant.payload.linkText : bar.linkText}
        linkUrl={variant.payload.linkUrl !== undefined ? variant.payload.linkUrl : bar.linkUrl}
        locale={locale}
      />
    ) : (
      control
    ),
  }));
  return <ExperimentSwitch experimentId={bar.experiment.experimentId} variants={variants} />;
}
