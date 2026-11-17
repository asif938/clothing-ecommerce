"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "../lib/api";

/**
 * Search-as-you-type pickers for customers (name, phone or email) and orders
 * (order number or phone), so staff never have to copy a database id from
 * one screen into another.
 */

export interface CustomerOption {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
}

export interface OrderOption {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  billingContact: { name?: string; phone?: string } | null;
}

const inputClass = "w-full rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground outline-none focus:border-brand";

function useSearch<T>(q: string, url: (term: string) => string, pick: (body: unknown) => T[]): T[] {
  const [results, setResults] = useState<T[]>([]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const handle = setTimeout(() => {
      api
        .get<unknown>(url(term))
        .then((body) => setResults(pick(body)))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- url/pick are stable per picker
  }, [q]);
  return q.trim().length >= 2 ? results : [];
}

function ResultList<T>({ items, label, onPick, empty }: { items: T[]; label: (item: T) => string; onPick: (item: T) => void; empty: boolean }) {
  const t = useTranslations("blocks");
  if (items.length === 0) return empty ? <span className="text-xs text-surface-foreground/60">{t("noResults")}</span> : null;
  return (
    <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-theme border border-border bg-surface shadow-lg">
      {items.map((item, i) => (
        <li key={i}>
          <button type="button" onClick={() => onPick(item)} className="w-full px-3 py-2 text-left text-sm text-surface-foreground hover:bg-muted">
            {label(item)}
          </button>
        </li>
      ))}
    </ul>
  );
}

export const customerLabel = (c: Pick<CustomerOption, "name" | "phone" | "email">) => [c.name, c.phone, c.email].filter(Boolean).join(" · ");

export function CustomerPicker({ onPick, exclude = [], placeholder }: { onPick: (customer: CustomerOption) => void; exclude?: string[]; placeholder?: string }) {
  const t = useTranslations("pickers");
  const [q, setQ] = useState("");
  const results = useSearch<CustomerOption>(q, (term) => `/admin/customers?search=${encodeURIComponent(term)}&pageSize=10`, (body) => (body as { items: CustomerOption[] }).items ?? []);
  const visible = results.filter((c) => !exclude.includes(c.id));
  return (
    <div className="relative w-full max-w-md">
      <input className={inputClass} value={q} placeholder={placeholder ?? t("searchCustomer")} onChange={(e) => setQ(e.target.value)} />
      <ResultList
        items={visible}
        label={customerLabel}
        empty={q.trim().length >= 2}
        onPick={(c) => {
          onPick(c);
          setQ("");
        }}
      />
    </div>
  );
}

interface StaffOption {
  id: string;
  name: string;
  email: string;
  status?: string;
}

let staffPromise: Promise<StaffOption[]> | null = null;

/** Dropdown of staff members by name (the list is short, so no search needed). */
export function StaffSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const t = useTranslations("pickers");
  const [staff, setStaff] = useState<StaffOption[]>([]);
  useEffect(() => {
    let alive = true;
    void (staffPromise ??= api.get<StaffOption[]>("/admin/staff").catch(() => [])).then((rows) => alive && setStaff(rows));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("chooseStaff")}</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} ({s.email})
        </option>
      ))}
    </select>
  );
}

export const orderLabel =(o: OrderOption) => `#${o.orderNumber} · ${o.billingContact?.name ?? ""} ${o.billingContact?.phone ?? ""} · ৳${(o.total / 100).toLocaleString()} · ${o.status}`;

export function OrderPicker({ onPick, exclude = [], placeholder }: { onPick: (order: OrderOption) => void; exclude?: string[]; placeholder?: string }) {
  const t = useTranslations("pickers");
  const [q, setQ] = useState("");
  const results = useSearch<OrderOption>(q, (term) => `/admin/orders?search=${encodeURIComponent(term)}&pageSize=10`, (body) => (body as { data: OrderOption[] }).data ?? []);
  const visible = results.filter((o) => !exclude.includes(o.id));
  return (
    <div className="relative w-full max-w-md">
      <input className={inputClass} value={q} placeholder={placeholder ?? t("searchOrder")} onChange={(e) => setQ(e.target.value)} />
      <ResultList
        items={visible}
        label={orderLabel}
        empty={q.trim().length >= 2}
        onPick={(o) => {
          onPick(o);
          setQ("");
        }}
      />
    </div>
  );
}
