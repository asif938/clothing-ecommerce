import { t } from "@clothing/shared";
import type { BlockComponentProps } from "../../registry.ts";
import type { ImageTextProps } from "./schema.ts";

export function ImageTextBlock({ props, locale }: BlockComponentProps<ImageTextProps>) {
  const heading = t(props.heading, locale as "bn" | "en");
  const body = t(props.body, locale as "bn" | "en");
  const ctaText = t(props.ctaText, locale as "bn" | "en");
  const reversed = props.imagePosition === "right";

  return (
    <section className={`mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:flex-row sm:items-center sm:gap-16 sm:px-8 sm:py-20 ${reversed ? "sm:flex-row-reverse" : ""}`}>
      <div className="aspect-[4/5] flex-1 overflow-hidden rounded-theme bg-muted">
        {props.imageUrl && (
          <img src={props.imageUrl} alt={t(props.imageAlt, locale as "bn" | "en")} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex flex-1 flex-col justify-center gap-4">
        {heading && <h2 className="text-balance text-3xl leading-tight text-surface-foreground sm:text-4xl">{heading}</h2>}
        <p className="max-w-prose text-pretty leading-relaxed text-surface-foreground/75">{body}</p>
        {ctaText && props.ctaUrl && (
          <a href={props.ctaUrl} className="mt-2 inline-flex h-12 w-fit items-center rounded-theme bg-brand px-8 text-sm font-medium tracking-wide text-brand-foreground transition-[opacity,transform] duration-300 hover:opacity-90 active:scale-[0.98]">
            {ctaText}
          </a>
        )}
      </div>
    </section>
  );
}
