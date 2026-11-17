import { t } from "@clothing/shared";
import type { BlockComponentProps } from "../../registry.ts";
import type { HeroProps } from "./schema.ts";

const ALIGN_CLASS = { left: "sm:items-start sm:text-left", center: "sm:items-center sm:text-center", right: "sm:items-end sm:text-right" } as const;
/** Desktop scrim: fades from the side the text sits on, so the copy stays legible over any photo while the other side stays untouched. Tinted with the page color, so it works for light and dark brands alike. */
const SCRIM_CLASS = {
  left: "sm:bg-gradient-to-r sm:from-surface/90 sm:via-surface/55 sm:to-transparent",
  center: "sm:bg-surface/55",
  right: "sm:bg-gradient-to-l sm:from-surface/90 sm:via-surface/55 sm:to-transparent",
} as const;

/** Side-aligned headlines stack into a narrow column so they stay beside the subject of the photo; a centered one can run wide. */
const HEADING_WIDTH_CLASS = { left: "sm:max-w-[11ch]", center: "sm:max-w-3xl", right: "sm:max-w-[11ch]" } as const;

export function HeroBlock({ props, locale }: BlockComponentProps<HeroProps>) {
  const heading = t(props.heading, locale as "bn" | "en");
  const subheading = t(props.subheading, locale as "bn" | "en");
  const ctaText = t(props.ctaText, locale as "bn" | "en");

  return (
    <section className="relative isolate overflow-hidden bg-muted">
      {props.imageUrl && (
        <img src={props.imageUrl} alt={t(props.imageAlt, locale as "bn" | "en")} loading="eager" fetchPriority="high" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      )}
      {/* Phones: text sits low on the photo over a bottom fade. From `sm`: text beside the subject over a side fade. */}
      <div aria-hidden="true" className={`absolute inset-0 -z-10 bg-gradient-to-t from-surface/95 via-surface/60 via-45% to-transparent ${SCRIM_CLASS[props.align]}`} />
      <div className="mx-auto flex max-w-6xl">
        <div
          className={`flex min-h-[460px] w-full animate-rise flex-col items-start justify-end gap-4 px-5 pb-10 pt-24 sm:min-h-[560px] sm:justify-center sm:gap-5 sm:px-8 sm:py-20 lg:min-h-[640px] ${ALIGN_CLASS[props.align]}`}
        >
          <h1 className={`max-w-[16ch] text-balance text-[2.5rem] leading-[1.05] text-surface-foreground sm:text-6xl lg:text-7xl [:lang(bn)_&]:text-[2.1rem] [:lang(bn)_&]:sm:text-5xl [:lang(bn)_&]:lg:text-[3.5rem] ${HEADING_WIDTH_CLASS[props.align]}`}>{heading}</h1>
          {subheading && <p className="max-w-md text-pretty text-base text-surface-foreground/80 sm:text-lg">{subheading}</p>}
          {ctaText && props.ctaUrl && (
            <a
              href={props.ctaUrl}
              className="mt-2 inline-flex h-12 items-center rounded-theme bg-brand px-8 text-sm font-medium tracking-wide text-brand-foreground transition-[opacity,transform] duration-300 hover:opacity-90 active:scale-[0.98]"
            >
              {ctaText}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
