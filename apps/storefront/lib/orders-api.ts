"use client";

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...init, cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = (await response.json().catch(() => null)) as T | { error?: { message?: string } } | null;
  if (!response.ok) throw new Error((data as { error?: { message?: string } } | null)?.error?.message ?? "Order not found");
  return data as T;
}

export interface TrackedOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  codAmount: number;
  events: { type: string; data: unknown; createdAt: string }[];
}

export const trackOrder = (phone: string, orderNumber: string) => callApi<TrackedOrder>(`/store/orders/track?phone=${encodeURIComponent(phone)}&orderNumber=${encodeURIComponent(orderNumber)}`);
