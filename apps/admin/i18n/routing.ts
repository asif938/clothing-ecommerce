import { defineRouting } from "next-intl/routing";

/**
 * docs/PROJECT_SPEC.md §4.5: default locale unprefixed (`bn` at `/`),
 * `en` prefixed (`/en/...`). The spec says this strategy is itself a
 * setting ("configurable"); `localePrefix: "as-needed"` is next-intl's
 * fixed implementation of exactly that one strategy — there is no
 * per-request way to swap strategies without a restart, so "configurable"
 * here means "set once in routing.ts", not "editable from the admin UI".
 * See docs/DECISIONS.md.
 */
export const routing = defineRouting({
  locales: ["bn", "en"],
  defaultLocale: "bn",
  localePrefix: "as-needed",
});
