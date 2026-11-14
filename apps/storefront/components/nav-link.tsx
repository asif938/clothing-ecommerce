import type { ReactNode } from "react";
import { Link } from "../i18n/navigation";
import type { NavItem } from "../lib/nav-items";

/** Locale-aware app link for internal hrefs, a plain new-tab anchor for other hosts, and a non-link span for target-less headings. */
export function NavLink({ item, className, children, onClick }: { item: Pick<NavItem, "href" | "external">; className?: string; children: ReactNode; onClick?: () => void }) {
  if (!item.href) return <span className={className}>{children}</span>;
  if (item.external) {
    return (
      <a href={item.href} className={className} target="_blank" rel="noopener noreferrer" onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <Link href={item.href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
