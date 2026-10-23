import { t } from "@clothing/shared";
import type { BlockComponentProps } from "../../registry.ts";
import type { HeroProps } from "./schema.ts";

const ALIGN_CLASS = { left: "items-start text-left", center: "items-center text-center", right: "items-end text-right" } as const;

export function HeroBlock({ props, locale }: BlockComponentProps<HeroProps>) {
  const heading = t(props.heading, locale as "bn" | "en");
  const subheading = t(props.subheading, locale as "bn" | "en");
  const ctaText = t(props.ctaText, locale as "bn" | "en");

  return (
    <section className="relative overflow-hidden bg-muted">
      {props.imageUrl && (
        <img src={props.imageUrl} alt={t(props.imageAlt, locale as "bn" | "en")} className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div className={`relative flex min-h-[420px] flex-col justify-center gap-4 px-6 py-16 sm:px-12 ${ALIGN_CLASS[props.align]}`}>
        <h1 className="max-w-2xl text-3xl font-semibold text-surface-foreground sm:text-5xl">{heading}</h1>
        {subheading && <p className="max-w-xl text-base text-surface-foreground/80 sm:text-lg">{subheading}</p>}
        {ctaText && props.ctaUrl && (
          <a href={props.ctaUrl} className="mt-2 inline-block rounded-theme bg-brand px-6 py-3 text-sm font-medium text-brand-foreground">
            {ctaText}
          </a>
        )}
      </div>
    </section>
  );
}
