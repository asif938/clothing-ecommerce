import { defineRouting } from "next-intl/routing";

/** docs/PROJECT_SPEC.md §4.5: default locale `bn` unprefixed, `en` prefixed. See apps/admin/i18n/routing.ts. */
export const routing = defineRouting({
  locales: ["bn", "en"],
  defaultLocale: "bn",
  localePrefix: "as-needed",
});
