"use client";

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...init, cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = (await response.json().catch(() => null)) as T | { error?: { message?: string } } | null;
  if (!response.ok) throw new Error((data as { error?: { message?: string } } | null)?.error?.message ?? "Something went wrong");
  return data as T;
}

export const me = () => callApi<{ loggedIn: boolean; phone?: string | null }>("/store/auth/me");
export const sendLoginOtp = (phone: string) => callApi<{ sent: true; devCode?: string }>("/store/auth/otp/send", { method: "POST", body: JSON.stringify({ phone, purpose: "login" }) });
export const verifyLoginOtp = (phone: string, code: string) => callApi<{ verified: boolean }>("/store/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, purpose: "login", code }) });
export const logout = () => callApi<{ ok: true }>("/store/auth/logout", { method: "POST" });

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
}
export const myOrders = () => callApi<OrderSummary[]>("/store/orders/mine");

export interface Address {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  divisionId: string;
  districtId: string;
  areaId: string;
  addressLine: string;
  landmark: string | null;
  isDefault: boolean;
}
export const myAddresses = () => callApi<Address[]>("/store/account/addresses");
export const deleteAddress = (id: string) => callApi<{ ok: true }>(`/store/account/addresses/${id}`, { method: "DELETE" });
