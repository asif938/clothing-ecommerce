import { t } from "@clothing/shared";
import type { BlockComponentProps } from "../../registry.ts";
import type { FaqAccordionProps } from "./schema.ts";

export function FaqAccordionBlock({ props, locale }: BlockComponentProps<FaqAccordionProps>) {
  if (props.items.length === 0) return null;
  return (
    <section className="mx-auto max-w-2xl px-6 py-10">
      {props.heading && <h2 className="mb-4 text-center text-2xl font-semibold text-surface-foreground">{t(props.heading, locale as "bn" | "en")}</h2>}
      <div className="flex flex-col divide-y divide-border">
        {props.items.map((item, index) => (
          <details key={index} className="group py-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-surface-foreground">{t(item.question, locale as "bn" | "en")}</summary>
            <p className="mt-2 text-sm text-surface-foreground/70">{t(item.answer, locale as "bn" | "en")}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
