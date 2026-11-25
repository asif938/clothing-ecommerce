"use client";

import type { ReactNode } from "react";
import NextLink from "next/link";
import { BlockLinkContext, type BlockLinkProps } from "@clothing/blocks";

/**
 * Block links (`@clothing/blocks` `BlockLink`) to store pages go through
 * Next's `<Link>`: the page swaps in place (header, bottom bar and scripts
 * stay), the route is prefetched when the link scrolls into view, and the
 * page's loading skeleton shows at once. Plain `next/link`, not the
 * locale-aware one, because block hrefs already carry the locale prefix
 * (`/en/p/…`) or are admin-entered paths.
 */
function renderBlockLink({ href, ...rest }: BlockLinkProps) {
  return <NextLink href={href} {...rest} />;
}

export function BlockLinkProvider({ children }: { children: ReactNode }) {
  return <BlockLinkContext.Provider value={renderBlockLink}>{children}</BlockLinkContext.Provider>;
}
