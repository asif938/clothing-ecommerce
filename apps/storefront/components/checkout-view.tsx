"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Link, useRouter } from "../i18n/navigation";
import { formatBdt } from "../lib/money";
import { readCookie } from "../lib/analytics";
import { useCart } from "../lib/use-cart";
import { readUtm } from "../lib/utm";
import { CheckoutCredits, CreditTotals } from "./checkout-credits";
import {
  availablePaymentMethods,
  areas as fetchAreas,
  districts as fetchDistricts,
  divisions as fetchDivisions,
  getShippingQuote,
  placeOrder,
  selectCartShippingRate,
  sendOtp,
  setCartAddress,
  setCartPoints,
  type ShippingRateOption,
} from "../lib/cart-api";

type LocationOption = { id: string; code: string; name: { bn?: string; en?: string } };

/**
 * One-page checkout (docs/PROJECT_SPEC.md §7.5). "Inside Dhaka / Outside
 * Dhaka" as a simple toggle instead of cascading selects is a setting
 * (`checkout.simpleDhakaToggle`) — not read here yet, since the public
 * `/store/config` payload this page would need it from isn't wired to
 * expose non-public settings; cascading selects are the one path built
 * this milestone (documented in docs/DECISIONS.md).
 */
export function CheckoutView() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "bn";
  const router = useRouter();
  const cart = useCart();

  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [landmark, setLandmark] = useState("");

  const [divisions, setDivisions] = useState<LocationOption[]>([]);
  const [districts, setDistricts] = useState<LocationOption[]>([]);
  const [areas, setAreas] = useState<LocationOption[]>([]);
  const [rates, setRates] = useState<ShippingRateOption[]>([]);
  const [methods, setMethods] = useState<string[]>([]);

  const [paymentMethod, setPaymentMethod] = useState<"cod" | "mock" | "sslcommerz" | "bkash" | "nagad">("cod");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpDevCode, setOtpDevCode] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    fetchDivisions().then(setDivisions).catch(() => undefined);
    availablePaymentMethods()
      .then((r) => setMethods(r.methods))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!divisionId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale lower-level options in response to the divisionId dependency itself changing, not fetched/external data.
    setDistricts([]);
    setAreas([]);
    fetchDistricts(divisionId).then(setDistricts).catch(() => undefined);
  }, [divisionId]);

  useEffect(() => {
    if (!districtId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale lower-level options in response to the districtId dependency itself changing, not fetched/external data.
    setAreas([]);
    fetchAreas(districtId).then(setAreas).catch(() => undefined);
  }, [districtId]);

  const addressComplete = !!(divisionId && districtId && areaId && addressLine && contactName && contactPhone);

  async function saveAddress() {
    if (!addressComplete) return;
    setAddressError(null);
    try {
      const result = await setCartAddress({ divisionId, districtId, areaId, addressLine, landmark: landmark || undefined, contactName, contactPhone, contactEmail: contactEmail || undefined });
      cart.setCart(result);
      const quote = await getShippingQuote(divisionId, districtId, areaId, result.pricing.totalWeightGrams, result.pricing.subtotalAfterDiscounts);
      setRates(quote.rates);
      if (quote.rates[0]) await selectCartShippingRate(quote.rates[0].rateId).then((r) => cart.setCart(r));
    } catch (error) {
      setAddressError(error instanceof Error ? error.message : "Could not save address");
    }
  }

  async function handleSendOtp() {
    await sendOtp(contactPhone, "checkout").then((r) => {
      setOtpSent(true);
      setOtpDevCode(r.devCode ?? null);
    });
  }

  async function handlePlaceOrder() {
    setPlacing(true);
    setPlaceError(null);
    try {
      // §10.5/§13.3 — generated once here so the client Purchase event (fired on
      // the success page) and the server-side CAPI/MP/Events-API copy share
      // the same id for platform-side dedup.
      const trackingEventId = crypto.randomUUID();
      const result = await placeOrder(
        { paymentMethod, otpCode: otpCode || undefined, termsAccepted, trackingEventId, fbc: readCookie("_fbc"), fbp: readCookie("_fbp"), sourceUrl: window.location.href, ...readUtm() },
        idempotencyKey.current,
      );
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
      } else {
        router.push(`/checkout/success?orderId=${result.order.id}&eventId=${trackingEventId}&total=${result.order.total}`);
      }
    } catch (error) {
      setPlaceError(error instanceof Error ? error.message : "Could not place order");
      idempotencyKey.current = crypto.randomUUID();
    } finally {
      setPlacing(false);
    }
  }

  const pricing = cart.data?.pricing;
  const otpRequired = pricing?.paymentRules.otpRequired ?? false;
  const disabledMethods = useMemo(() => new Set(pricing?.paymentRules.disabledMethods ?? []), [pricing]);

  if (cart.loading) return <div className="mx-auto max-w-2xl px-4 py-10">…</div>;
  if (!cart.data || pricing?.lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-surface-foreground/70">{locale === "bn" ? "আপনার কার্ট খালি।" : "Your cart is empty."}</p>
        <Link href="/" className="mt-4 inline-block text-brand underline">
          {locale === "bn" ? "শপিং চালিয়ে যান" : "Continue shopping"}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-8">
      <h1 className="mb-6 text-2xl font-semibold text-surface-foreground">{locale === "bn" ? "চেকআউট" : "Checkout"}</h1>

      <section className="mb-6 space-y-3">
        <h2 className="text-sm font-semibold text-surface-foreground">{locale === "bn" ? "যোগাযোগ" : "Contact"}</h2>
        <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder={locale === "bn" ? "নাম" : "Name"} className="w-full rounded-theme border border-border px-3 py-2 text-sm" />
        <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder={locale === "bn" ? "মোবাইল নম্বর" : "Mobile number"} className="w-full rounded-theme border border-border px-3 py-2 text-sm" />
        <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder={locale === "bn" ? "ইমেইল (ঐচ্ছিক)" : "Email (optional)"} className="w-full rounded-theme border border-border px-3 py-2 text-sm" />
      </section>

      <section className="mb-6 space-y-3">
        <h2 className="text-sm font-semibold text-surface-foreground">{locale === "bn" ? "ঠিকানা" : "Address"}</h2>
        <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)} className="w-full rounded-theme border border-border px-3 py-2 text-sm">
          <option value="">{locale === "bn" ? "বিভাগ নির্বাচন করুন" : "Select division"}</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name[locale as "bn" | "en"] ?? d.name.en}
            </option>
          ))}
        </select>
        <select value={districtId} onChange={(e) => setDistrictId(e.target.value)} disabled={!divisionId} className="w-full rounded-theme border border-border px-3 py-2 text-sm">
          <option value="">{locale === "bn" ? "জেলা নির্বাচন করুন" : "Select district"}</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name[locale as "bn" | "en"] ?? d.name.en}
            </option>
          ))}
        </select>
        <select value={areaId} onChange={(e) => setAreaId(e.target.value)} disabled={!districtId} className="w-full rounded-theme border border-border px-3 py-2 text-sm">
          <option value="">{locale === "bn" ? "এলাকা নির্বাচন করুন" : "Select area"}</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name[locale as "bn" | "en"] ?? a.name.en}
            </option>
          ))}
        </select>
        <input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} placeholder={locale === "bn" ? "বিস্তারিত ঠিকানা" : "Address line"} className="w-full rounded-theme border border-border px-3 py-2 text-sm" />
        <input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder={locale === "bn" ? "ল্যান্ডমার্ক (ঐচ্ছিক)" : "Landmark (optional)"} className="w-full rounded-theme border border-border px-3 py-2 text-sm" />
        <button onClick={saveAddress} disabled={!addressComplete} className="rounded-theme border border-brand px-4 py-2 text-sm text-brand disabled:opacity-50">
          {locale === "bn" ? "ঠিকানা সংরক্ষণ করুন" : "Save address"}
        </button>
        {addressError && <p className="text-xs text-danger">{addressError}</p>}
      </section>

      {rates.length > 0 && (
        <section className="mb-6 space-y-2">
          <h2 className="text-sm font-semibold text-surface-foreground">{locale === "bn" ? "ডেলিভারি পদ্ধতি" : "Delivery method"}</h2>
          {rates.map((rate) => (
            <label key={rate.rateId} className="flex items-center justify-between rounded-theme border border-border px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <input type="radio" name="rate" checked={cart.data?.cart.selectedShippingRateId === rate.rateId} onChange={() => selectCartShippingRate(rate.rateId).then(cart.setCart)} />
                {rate.name[locale as "bn" | "en"] ?? rate.name.en} ({rate.estimatedDaysMin}-{rate.estimatedDaysMax} {locale === "bn" ? "দিন" : "days"})
              </span>
              <span>{formatBdt(rate.fee)}</span>
            </label>
          ))}
        </section>
      )}

      <section className="mb-6 space-y-2">
        <h2 className="text-sm font-semibold text-surface-foreground">{locale === "bn" ? "পেমেন্ট পদ্ধতি" : "Payment method"}</h2>
        {methods.map((method) => (
          <label key={method} className="flex items-center gap-2 text-sm">
            <input type="radio" name="payment" checked={paymentMethod === method} disabled={disabledMethods.has(method)} onChange={() => setPaymentMethod(method as typeof paymentMethod)} />
            {method.toUpperCase()}
            {disabledMethods.has(method) && <span className="text-xs text-danger">{locale === "bn" ? "উপলব্ধ নয়" : "not available"}</span>}
          </label>
        ))}
        {pricing && pricing.paymentRules.advanceRequired && (
          <p className="text-xs text-amber-600">
            {locale === "bn" ? "অর্ডার নিশ্চিত করতে অগ্রিম পেমেন্ট প্রয়োজন।" : "An advance payment is required to confirm this order."}
          </p>
        )}
      </section>

      {otpRequired && (
        <section className="mb-6 space-y-2">
          <h2 className="text-sm font-semibold text-surface-foreground">{locale === "bn" ? "ফোন নম্বর যাচাই" : "Verify your phone"}</h2>
          {!otpSent ? (
            <button onClick={handleSendOtp} className="rounded-theme border border-brand px-4 py-2 text-sm text-brand">
              {locale === "bn" ? "কোড পাঠান" : "Send code"}
            </button>
          ) : (
            <>
              <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder={locale === "bn" ? "যাচাইকরণ কোড" : "Verification code"} className="w-full rounded-theme border border-border px-3 py-2 text-sm" />
              {otpDevCode && <p className="text-xs text-surface-foreground/50">dev code: {otpDevCode}</p>}
            </>
          )}
        </section>
      )}

      {pricing?.loyalty && pricing.loyalty.balance > 0 && (
        <section className="mb-6 space-y-1 rounded-theme border border-border p-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={pricing.loyalty.pointsApplied > 0}
              disabled={pricing.loyalty.maxUsablePoints === 0}
              onChange={(e) => void setCartPoints(e.target.checked ? pricing.loyalty!.maxUsablePoints : 0).then(cart.setCart)}
            />
            {locale === "bn"
              ? `${pricing.loyalty.maxUsablePoints} পয়েন্ট ব্যবহার করুন (−${formatBdt(pricing.loyalty.maxUsablePoints * pricing.loyalty.pointValue)})`
              : `Use ${pricing.loyalty.maxUsablePoints} points (−${formatBdt(pricing.loyalty.maxUsablePoints * pricing.loyalty.pointValue)})`}
          </label>
          <p className="text-xs text-surface-foreground/60">
            {pricing.loyalty.maxUsablePoints === 0
              ? locale === "bn"
                ? `কমপক্ষে ${pricing.loyalty.minRedeemPoints} পয়েন্ট লাগবে। আপনার আছে ${pricing.loyalty.balance}।`
                : `You need at least ${pricing.loyalty.minRedeemPoints} usable points. You have ${pricing.loyalty.balance}.`
              : locale === "bn"
                ? `আপনার ব্যালান্স: ${pricing.loyalty.balance} পয়েন্ট`
                : `Your balance: ${pricing.loyalty.balance} points`}
          </p>
        </section>
      )}

      {pricing && <CheckoutCredits pricing={pricing} locale={locale} onCart={cart.setCart} />}

      <section className="mb-6 flex items-center gap-2">
        <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} id="terms" />
        <label htmlFor="terms" className="text-sm">
          {locale === "bn" ? "আমি শর্তাবলীতে সম্মত" : "I accept the terms"}
        </label>
      </section>

      {pricing && (
        <div className="mb-6 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>{locale === "bn" ? "সাবটোটাল" : "Subtotal"}</span>
            <span>{formatBdt(pricing.subtotalAfterDiscounts)}</span>
          </div>
          <div className="flex justify-between">
            <span>{locale === "bn" ? "ডেলিভারি" : "Delivery"}</span>
            <span>{formatBdt(pricing.shippingFee - pricing.shippingDiscount)}</span>
          </div>
          {pricing.loyalty && pricing.loyalty.discount > 0 && (
            <div className="flex justify-between">
              <span>{locale === "bn" ? "পয়েন্ট" : "Points"}</span>
              <span>−{formatBdt(pricing.loyalty.discount)}</span>
            </div>
          )}
          <CreditTotals pricing={pricing} locale={locale} />
          <div className="flex justify-between font-semibold text-surface-foreground">
            <span>{pricing.amountDue !== pricing.total ? (locale === "bn" ? "পরিশোধ বাকি" : "To pay") : locale === "bn" ? "সর্বমোট" : "Total"}</span>
            <span>{formatBdt(pricing.amountDue)}</span>
          </div>
        </div>
      )}

      {placeError && <p className="mb-3 text-sm text-danger">{placeError}</p>}
      <button onClick={handlePlaceOrder} disabled={placing || !addressComplete} className="w-full rounded-theme bg-brand px-6 py-3 text-sm font-medium text-brand-foreground disabled:opacity-60">
        {placing ? "…" : locale === "bn" ? "অর্ডার করুন" : "Place order"}
      </button>
    </div>
  );
}
