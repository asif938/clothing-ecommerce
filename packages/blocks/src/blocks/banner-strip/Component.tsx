import { t } from "@clothing/shared";
import type { BlockComponentProps } from "../../registry.ts";
import type { BannerStripProps } from "./schema.ts";

// Tailwind only picks up complete, literal class strings when scanning
// source files — a template-interpolated `sm:grid-cols-${n}` would never
// make it into the generated CSS, hence this lookup instead.
const GRID_COLS_CLASS: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };

export function BannerStripBlock({ props, locale }: BlockComponentProps<BannerStripProps>) {
  if (props.items.length === 0) return null;
  return (
    <section className={`mx-auto grid max-w-6xl gap-3 px-4 py-6 sm:gap-5 sm:px-8 sm:py-10 ${GRID_COLS_CLASS[props.items.length] ?? "sm:grid-cols-2"}`}>
      {props.items.map((item, index) => {
        const content = (
          <div className="relative aspect-[16/9] overflow-hidden rounded-theme bg-muted">
            {item.imageUrl && (
              <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
            )}
            {item.text && <span className="absolute bottom-3 left-3 rounded-theme bg-surface/95 px-3.5 py-1.5 text-sm font-medium text-surface-foreground backdrop-blur-sm">{t(item.text, locale as "bn" | "en")}</span>}
          </div>
        );
        return item.linkUrl ? (
          <a key={index} href={item.linkUrl}>
            {content}
          </a>
        ) : (
          <div key={index}>{content}</div>
        );
      })}
    </section>
  );
}
