import type { Metadata } from "next";
import { ConfirmOrderView } from "../../../../components/confirm-order-view";

// A tokenised, per-order URL: never index it or leak the token via referrer.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function ConfirmOrderPage() {
  return <ConfirmOrderView />;
}
