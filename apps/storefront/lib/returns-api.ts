"use client";

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...init, cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = (await response.json().catch(() => null)) as T | { error?: { message?: string } } | null;
  if (!response.ok) throw new Error((data as { error?: { message?: string } } | null)?.error?.message ?? "Something went wrong");
  return data as T;
}

export interface ReturnReason {
  id: string;
  code: string;
  label: { en?: string; bn?: string };
}
export const listReturnReasons = () => callApi<ReturnReason[]>("/store/return-reasons");

export interface ReturnSummary {
  id: string;
  type: "refund" | "exchange" | "store_credit";
  status: string;
  createdAt: string;
}
export const myReturns = () => callApi<ReturnSummary[]>("/store/returns/mine");

export interface CreateReturnRequestInput {
  orderId: string;
  type: "refund" | "exchange" | "store_credit";
  reasonCode: string | null;
  customerComment: string | null;
  items: { orderItemId: string; quantity: number }[];
}
export const createReturnRequest = (input: CreateReturnRequestInput) => callApi<ReturnSummary>("/store/returns", { method: "POST", body: JSON.stringify(input) });

/** §16 M10 — the guest (no account) path from the order-tracking page. */
export interface CreateReturnRequestByTrackingInput extends Omit<CreateReturnRequestInput, "orderId"> {
  phone: string;
  orderNumber: string;
}
export const createReturnRequestByTracking = (input: CreateReturnRequestByTrackingInput) => callApi<ReturnSummary>("/store/returns/track", { method: "POST", body: JSON.stringify(input) });
