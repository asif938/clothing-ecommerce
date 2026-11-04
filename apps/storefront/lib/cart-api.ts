"use client";

/**
 * Client-side cart/checkout calls (docs/PROJECT_SPEC.md §7.5, §11.1) — these
 * go through the storefront's own `/api/:path*` rewrite (`next.config.mjs`)
 * to the real API, same-origin from the browser's point of view, so the
 * API's `anonymous_id`/customer cookies round-trip normally with no CORS
 * cookie dance needed. Never cached (`cache: "no-store"`): prices/stock
 * must always be the server's current answer (golden rule 6).
 */

export interface PricedLine {
  cartItemId: string;
  variantId: string;
  productId: string;
  title: { bn?: string; en?: string };
  imageUrl: string | null;
  sku: string;
  unitPrice: number;
  compareAtPrice: number | null;
  requestedQuantity: number;
  quantity: number;
  available: number;
  lineTotal: number;
  clamped: boolean;
  unavailable: boolean;
  priceChanged: boolean;
}

export interface RejectedCode {
  code: string;
  reasonCode: string;
  message: string;
}

export interface CartPricing {
  lines: PricedLine[];
  subtotal: number;
  discounts: { applied: { code: string | null; amount: number }[]; rejectedCodes: RejectedCode[]; totalDiscount: number; freeShipping: boolean };
  subtotalAfterDiscounts: number;
  totalWeightGrams: number;
  shippingFee: number;
  shippingRateId: string | null;
  shippingEstimateDaysMin: number | null;
  shippingEstimateDaysMax: number | null;
  shippingBlockedMessage: string | null;
  shippingDiscount: number;
  giftWrapFee: number;
  paymentRules: { disabledMethods: string[]; advanceRequired: { kind: string; amount?: number; percent?: number } | null; otpRequired: boolean; blocked: string | null; messages: string[] };
  total: number;
  codAmount: number;
  freeDeliveryRemaining: number | null;
  warnings: string[];
}

export interface CartItem {
  id: string;
  variantId: string;
  quantity: number;
}

export interface CartData {
  id: string;
  divisionId: string | null;
  districtId: string | null;
  areaId: string | null;
  addressLine: string | null;
  landmark: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  couponCodes: string[];
  giftWrap: boolean;
  customerNote: string | null;
  selectedShippingRateId: string | null;
  items: CartItem[];
}

export interface CartResponse {
  cart: CartData;
  pricing: CartPricing;
}

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = (await response.json().catch(() => null)) as T | { error?: { code: string; message: string } } | null;
  if (!response.ok) {
    const message = (data as { error?: { message?: string } } | null)?.error?.message ?? "Something went wrong. Please try again.";
    throw new Error(message);
  }
  return data as T;
}

export const getCart = () => callApi<CartResponse>("/store/cart");
export const addCartItem = (variantId: string, quantity: number) => callApi<CartResponse>("/store/cart/items", { method: "POST", body: JSON.stringify({ variantId, quantity }) });
export const updateCartItem = (id: string, quantity: number) => callApi<CartResponse>(`/store/cart/items/${id}`, { method: "PATCH", body: JSON.stringify({ quantity }) });
export const removeCartItem = (id: string) => callApi<CartResponse>(`/store/cart/items/${id}`, { method: "DELETE" });
export const setCartCodes = (codes: string[]) => callApi<CartResponse>("/store/cart/codes", { method: "PUT", body: JSON.stringify({ codes }) });
export const setCartAddress = (address: { divisionId: string; districtId: string; areaId: string; addressLine: string; landmark?: string; contactName: string; contactPhone: string; contactEmail?: string }) =>
  callApi<CartResponse>("/store/cart/address", { method: "PATCH", body: JSON.stringify(address) });
export const selectCartShippingRate = (rateId: string) => callApi<CartResponse>("/store/cart/shipping-rate", { method: "PATCH", body: JSON.stringify({ rateId }) });
export const setCartGiftWrap = (giftWrap: boolean) => callApi<CartResponse>("/store/cart/gift-wrap", { method: "PATCH", body: JSON.stringify({ giftWrap }) });

export interface PlaceOrderInput {
  paymentMethod: "cod" | "mock" | "sslcommerz" | "bkash" | "nagad";
  advanceMethod?: "mock" | "sslcommerz" | "bkash" | "nagad";
  otpCode?: string;
  termsAccepted?: boolean;
  turnstileToken?: string;
  /** §10.5/§13.3 — see `checkout-view.tsx` for why this is generated client-side. */
  trackingEventId?: string;
  fbc?: string;
  fbp?: string;
  sourceUrl?: string;
}

export interface PlaceOrderResult {
  order: { id: string; orderNumber: string; status: string; total: number; codAmount: number };
  redirectUrl: string | null;
  advanceAmount: number;
  codAmount: number;
  replay: boolean;
  warnings: string[];
}

/** A fresh key per checkout *attempt* (regenerated on each explicit retry, kept stable across accidental double-clicks/retried network errors — §7.5 "prevent double submission"). */
export function placeOrder(input: PlaceOrderInput, idempotencyKey: string): Promise<PlaceOrderResult> {
  return callApi<PlaceOrderResult>("/store/checkout/place-order", { method: "POST", body: JSON.stringify(input), headers: { "Idempotency-Key": idempotencyKey } });
}

export const divisions = () => callApi<{ id: string; code: string; name: { bn?: string; en?: string } }[]>("/store/locations/divisions");
export const districts = (divisionId: string) => callApi<{ id: string; code: string; name: { bn?: string; en?: string } }[]>(`/store/locations/districts?divisionId=${divisionId}`);
export const areas = (districtId: string) => callApi<{ id: string; code: string; name: { bn?: string; en?: string }; isDhakaCity: boolean }[]>(`/store/locations/areas?districtId=${districtId}`);

export const sendOtp = (phone: string, purpose: "login" | "checkout") => callApi<{ sent: true; devCode?: string }>("/store/auth/otp/send", { method: "POST", body: JSON.stringify({ phone, purpose }) });
export const verifyOtp = (phone: string, purpose: "login" | "checkout", code: string) =>
  callApi<{ verified: boolean }>("/store/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, purpose, code }) });

export const availablePaymentMethods = () => callApi<{ methods: string[] }>("/store/payments/methods");

export interface ShippingRateOption {
  rateId: string;
  name: { bn?: string; en?: string };
  fee: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
}
export const getShippingQuote = (divisionId: string, districtId: string, areaId: string, weightGrams: number, subtotal: number) =>
  callApi<{ zoneId: string | null; rates: ShippingRateOption[] }>(
    `/store/shipping/quote?divisionId=${divisionId}&districtId=${districtId}&areaId=${areaId}&weightGrams=${weightGrams}&subtotal=${subtotal}`,
  );
