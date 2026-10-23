import type { Metadata } from "next";
import { listBlockDefinitions } from "@clothing/blocks";

export const metadata: Metadata = { title: "Styleguide", robots: { index: false, follow: false } };

/**
 * docs/PROJECT_SPEC.md §7.1 — every registered block rendered in both
 * locales, admin-only in spirit (noindex; not linked from any nav — there's
 * no staff-only route gate on the storefront app itself yet, so this is
 * "hidden by omission," not auth-protected. §9.1's `product_grid`/
 * `category_tiles` need real catalog data to render anything, so they're
 * shown here with a placeholder note instead of live data.
 */
export default function StyleguidePage() {
  const blocks = listBlockDefinitions();

  return (
    <div className="flex flex-col gap-10 p-8">
      <h1 className="text-2xl font-semibold">Styleguide — block library</h1>
      {blocks.map((definition) => {
        const needsLiveData = definition.type === "product_grid" || definition.type === "category_tiles";
        return (
          <section key={definition.type} className="flex flex-col gap-4 border-b border-border pb-8">
            <h2 className="text-lg font-semibold">
              {definition.type} — {definition.label.en} / {definition.label.bn}
            </h2>
            {needsLiveData ? (
              <p className="text-sm text-surface-foreground/60">Needs live catalog data — see it on the home page instead of a static sample here.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs uppercase text-surface-foreground/50">en</p>
                  <div className="rounded-theme border border-border">
                    <definition.component props={definition.defaults} locale="en" />
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs uppercase text-surface-foreground/50">bn</p>
                  <div className="rounded-theme border border-border">
                    <definition.component props={definition.defaults} locale="bn" />
                  </div>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
