import type { ReactNode } from "react";

/**
 * The heading every content block opens with. Display serif (set by the
 * storefront's base styles on `h2`), centered, with a small diamond between
 * two hairlines underneath — a nod to the woven border of a saree.
 * Plain Tailwind utilities only, so it renders the same wherever blocks are shown.
 */
export function SectionHeading({ children, align = "center" }: { children: ReactNode; align?: "center" | "left" }) {
  const centered = align === "center";
  return (
    <div className={`mb-8 flex flex-col gap-4 sm:mb-12 ${centered ? "items-center text-center" : "items-start text-left"}`}>
      <h2 className="text-balance text-[1.75rem] leading-tight text-surface-foreground sm:text-4xl">{children}</h2>
      <span aria-hidden="true" className="flex items-center gap-2 text-accent">
        <span className="h-px w-8 bg-current opacity-60 sm:w-12" />
        <span className="h-1.5 w-1.5 rotate-45 bg-current" />
        <span className="h-px w-8 bg-current opacity-60 sm:w-12" />
      </span>
    </div>
  );
}
