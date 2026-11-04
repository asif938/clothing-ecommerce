import { Link } from "../../../../i18n/navigation";
import { PurchaseTracker } from "../../../../components/purchase-tracker";

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ orderId?: string; eventId?: string; total?: string }>;
}) {
  const { locale } = await params;
  const { eventId, total } = await searchParams;
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <PurchaseTracker eventId={eventId ?? null} total={total ? Number(total) : null} />
      <h1 className="text-2xl font-semibold text-surface-foreground">{locale === "bn" ? "ধন্যবাদ! আপনার অর্ডার গ্রহণ করা হয়েছে।" : "Thank you! Your order has been placed."}</h1>
      <p className="mt-2 text-sm text-surface-foreground/70">
        {locale === "bn" ? "আমরা শীঘ্রই আপনার সাথে যোগাযোগ করব।" : "We'll be in touch shortly to confirm it."}
      </p>
      <Link href="/" className="mt-6 inline-block text-brand underline">
        {locale === "bn" ? "হোমে ফিরে যান" : "Back to home"}
      </Link>
    </div>
  );
}
