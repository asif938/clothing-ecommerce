import { t } from "@clothing/shared";
import type { BlockComponentProps } from "../../registry.ts";
import type { ImageTextProps } from "./schema.ts";

export function ImageTextBlock({ props, locale }: BlockComponentProps<ImageTextProps>) {
  const heading = t(props.heading, locale as "bn" | "en");
  const body = t(props.body, locale as "bn" | "en");
  const ctaText = t(props.ctaText, locale as "bn" | "en");
  const reversed = props.imagePosition === "right";

  return (
    <section className={`mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10 sm:flex-row ${reversed ? "sm:flex-row-reverse" : ""}`}>
      <div className="aspect-square flex-1 overflow-hidden rounded-theme bg-muted">
        {props.imageUrl && (
          <img src={props.imageUrl} alt={t(props.imageAlt, locale as "bn" | "en")} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex flex-1 flex-col justify-center gap-3">
        {heading && <h2 className="text-2xl font-semibold text-surface-foreground">{heading}</h2>}
        <p className="text-surface-foreground/80">{body}</p>
        {ctaText && props.ctaUrl && (
          <a href={props.ctaUrl} className="mt-2 inline-block w-fit rounded-theme bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground">
            {ctaText}
          </a>
        )}
      </div>
    </section>
  );
}
