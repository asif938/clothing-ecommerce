import { Link } from "../../../../i18n/navigation";

/** §7.5 "Failure/cancel → back to checkout with message and a retry button; order remains pending_payment until timeout." */
export default async function CheckoutFailedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-surface-foreground">{locale === "bn" ? "পেমেন্ট ব্যর্থ হয়েছে" : "Payment failed"}</h1>
      <p className="mt-2 text-sm text-surface-foreground/70">
        {locale === "bn" ? "আপনার অর্ডারটি এখনও সংরক্ষিত আছে — আবার চেষ্টা করুন।" : "Your order is still on hold — please try again."}
      </p>
      <Link href="/checkout" className="mt-6 inline-block rounded-theme bg-brand px-6 py-3 text-sm font-medium text-brand-foreground">
        {locale === "bn" ? "আবার চেষ্টা করুন" : "Retry"}
      </Link>
    </div>
  );
}
