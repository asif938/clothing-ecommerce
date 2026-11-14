"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "../i18n/navigation";

/** Switches between `bn` (unprefixed) and `en` (`/en/...`) on the same page (§4.5). The label names the target language, from UI strings. */
export function LanguageSwitch({ label, className }: { label: string; className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const target = locale === "en" ? "bn" : "en";
  return (
    <Link href={pathname} locale={target} hrefLang={target} lang={target} className={className}>
      {label}
    </Link>
  );
}
