import type { Metadata } from "next";
import { AffiliatePortalView } from "../../../../components/affiliate-portal-view";

/** Private partner link: never indexed, never leaked through a Referer header. */
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function AffiliatePortalPage() {
  return <AffiliatePortalView />;
}
