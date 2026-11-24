import type { Metadata } from "next";
import { Link } from "../../../../i18n/navigation";
import { ReviewOrderForm } from "../../../../components/review-order-form";
import { resolveReviewText } from "../../../../lib/review-text";
import { getReviewOrder, getUiStrings } from "../../../../lib/store-api";

// A per-order link that works without login: never index it, and don't leak it through the referrer.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** `/review/<token>` — review every item of one delivered order (from the review-request message, the account or the product page). */
export default async function ReviewPage({ params }: { params: Promise<{ token: string; locale: string }> }) {
  const { token, locale } = await params;
  const [order, strings] = await Promise.all([getReviewOrder(token), getUiStrings()]);
  const text = resolveReviewText(strings, locale);

  if (order === null || order === "invalid" || !order.delivered) {
    const message = order && order !== "invalid" ? text.notDelivered : text.invalidLink;
    return (
      <div className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-16">
        <p className="text-base text-surface-foreground">{message}</p>
        <Link href="/shop" className="text-sm text-brand underline underline-offset-4">
          {text.continueShopping}
        </Link>
      </div>
    );
  }

  return <ReviewOrderForm token={token} orderNumber={order.orderNumber} items={order.items} text={text} locale={locale} />;
}
