import { t } from "@clothing/shared";
import type { BlockComponentProps } from "../../registry.ts";
import type { RichTextProps } from "./schema.ts";

export function RichTextBlock({ props, locale }: BlockComponentProps<RichTextProps>) {
  const content = t(props.content, locale as "bn" | "en");
  const paragraphs = content.split(/\n{2,}/).filter(Boolean);
  return (
    <section className={`mx-auto max-w-3xl px-6 py-10 ${props.align === "center" ? "text-center" : "text-left"}`}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="mb-4 text-surface-foreground/90">
          {paragraph}
        </p>
      ))}
    </section>
  );
}
