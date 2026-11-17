"use client";

import { apiErrorMessage } from "./api-error";
async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...init, cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = (await response.json().catch(() => null)) as T | { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(apiErrorMessage(data, "Order not found"));
  return data as T;
}

export interface TrackedShipment {
  id: string;
  status: string;
  trackingCode: string | null;
  trackingUrl: string | null;
  courierDriver: string;
}

export interface TrackedOrderItem {
  id: string;
  title: { en?: string; bn?: string };
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface TrackedOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  codAmount: number;
  events: { type: string; data: unknown; createdAt: string }[];
  shipments: TrackedShipment[];
  items: TrackedOrderItem[];
}

export const trackOrder = (phone: string, orderNumber: string) => callApi<TrackedOrder>(`/store/orders/track?phone=${encodeURIComponent(phone)}&orderNumber=${encodeURIComponent(orderNumber)}`);
