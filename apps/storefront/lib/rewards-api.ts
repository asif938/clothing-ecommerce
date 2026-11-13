"use client";

/** §16 M16 storefront calls — gift cards, store credit wallet, referrals, affiliate portal. Same-origin through the `/api` rewrite, never cached. */
async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...init, cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = (await response.json().catch(() => null)) as T | { error?: { message?: string } } | null;
  if (!response.ok) throw new Error((data as { error?: { message?: string } } | null)?.error?.message ?? "Something went wrong");
  return data as T;
}

export interface GiftCardOptions {
  enabled: boolean;
  purchaseEnabled: boolean;
  presets: number[];
  allowCustom: boolean;
  minAmount: number;
  maxAmount: number;
  expiryMonths: number;
  paymentMethods: string[];
}
export const giftCardOptions = () => callApi<GiftCardOptions>("/store/gift-cards/options");

export interface GiftCardPurchaseInput {
  amount: number;
  paymentMethod: "mock" | "sslcommerz" | "bkash" | "nagad";
  purchaserName: string;
  purchaserPhone: string;
  purchaserEmail?: string;
  recipientName: string;
  recipientPhone?: string;
  recipientEmail?: string;
  message?: string;
  locale: "bn" | "en";
}
export const purchaseGiftCard = (input: GiftCardPurchaseInput) => callApi<{ token: string; redirectUrl: string }>("/store/gift-cards/purchase", { method: "POST", body: JSON.stringify(input) });

export interface GiftCardPurchaseStatus {
  status: "pending" | "active" | "redeemed" | "cancelled" | "disabled" | "expired";
  amount: number;
  recipientName: string | null;
  sentTo: string | null;
  last4: string | null;
  delivered: boolean;
}
export const giftCardPurchaseStatus = (token: string) => callApi<GiftCardPurchaseStatus>(`/store/gift-cards/purchase/${encodeURIComponent(token)}`);

export const giftCardBalance = (code: string) =>
  callApi<{ last4: string; balance: number; expiresAt: string | null; usable: boolean; reason: string | null }>("/store/gift-cards/balance", { method: "POST", body: JSON.stringify({ code }) });
export const giftCardToWallet = (code: string) => callApi<{ amount: number }>("/store/gift-cards/wallet", { method: "POST", body: JSON.stringify({ code }) });

export interface StoreCreditEntry {
  id: string;
  amount: number;
  reason: string;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
}
export const myStoreCredit = () => callApi<{ enabled: boolean; balance: number; ledger: { items: StoreCreditEntry[]; total: number } }>("/store/account/store-credit");

export interface MyReferrals {
  enabled: boolean;
  code: string | null;
  link: string | null;
  rules: { discount: { type: "percent" | "fixed"; value: number; maxDiscount: number; minOrder: number }; rewardType: "store_credit" | "points"; rewardAmount: number; rewardPoints: number };
  referrals: { id: string; refereePhone: string; status: "pending" | "rewarded" | "void"; rewardType: string | null; rewardAmount: number | null; createdAt: string }[];
  totals: { pending: number; rewarded: number; earnedCredit: number; earnedPoints: number };
}
export const myReferrals = (locale: string) => callApi<MyReferrals>(`/store/account/referrals?locale=${locale === "en" ? "en" : "bn"}`);

export interface AffiliatePortal {
  name: string;
  code: string;
  status: "active" | "paused";
  link: string;
  couponCode: string | null;
  commission: { type: "percent" | "fixed"; value: number };
  clickDays: { day: string; clicks: number }[];
  recent: { id: string; source: string; orderAmount: number; commission: number; status: "pending" | "approved" | "rejected" | "paid"; createdAt: string }[];
  balances: { pending: { amount: number; count: number }; approved: { amount: number; count: number }; paid: { amount: number; count: number } };
}
export const affiliatePortal = (token: string) => callApi<AffiliatePortal>(`/store/affiliates/portal/${encodeURIComponent(token)}`);
