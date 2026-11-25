"use client";

import { createContext, useContext, type AnchorHTMLAttributes, type ReactNode } from "react";

export type BlockLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/**
 * How blocks render a link to another page of the store. This package doesn't
 * depend on a framework, so the storefront supplies its client-side link
 * (`BlockLinkProvider`, as a render function) and every block link to a
 * store page (`/…`) switches pages without reloading the whole site and is
 * prefetched. External links, and any link with no provider, stay plain `<a>`.
 */
export const BlockLinkContext = createContext<((props: BlockLinkProps) => ReactNode) | null>(null);

function isStorePath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

export function BlockLink(props: BlockLinkProps) {
  const renderLink = useContext(BlockLinkContext);
  if (!renderLink || !isStorePath(props.href)) return <a {...props} />;
  return renderLink(props);
}
