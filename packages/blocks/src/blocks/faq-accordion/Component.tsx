import { t } from "@clothing/shared";
import type { BlockComponentProps } from "../../registry.ts";
import { SectionHeading } from "../../section-heading.tsx";
import type { FaqAccordionProps } from "./schema.ts";

export function FaqAccordionBlock({ props, locale }: BlockComponentProps<FaqAccordionProps>) {
  if (props.items.length === 0) return null;
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-8 sm:py-20">
      {props.heading && <SectionHeading>{t(props.heading, locale as "bn" | "en")}</SectionHeading>}
      <div className="flex flex-col divide-y divide-border border-y border-border">
        {props.items.map((item, index) => (
          <details key={index} className="group">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-4 text-base font-medium text-surface-foreground marker:hidden [&::-webkit-details-marker]:hidden">
              {t(item.question, locale as "bn" | "en")}
              {/* Plus that turns into a cross when open — shows which row is expanded. */}
              <span aria-hidden="true" className="relative h-3.5 w-3.5 shrink-0 text-accent transition-transform duration-300 group-open:rotate-45">
                <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-current" />
                <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-current" />
              </span>
            </summary>
            <p className="max-w-prose pb-5 pr-10 text-[15px] leading-relaxed text-surface-foreground/70">{t(item.answer, locale as "bn" | "en")}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
