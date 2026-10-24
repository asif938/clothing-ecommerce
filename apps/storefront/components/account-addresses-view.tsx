"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "../i18n/navigation";
import { deleteAddress, me, myAddresses, type Address } from "../lib/account-api";

/** §7.5 "saved addresses for logged-in customers" — view/remove here; new ones are saved from checkout's own address form (not duplicated as a second form on this page). */
export function AccountAddressesView() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "bn";
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[] | null>(null);

  useEffect(() => {
    me().then((result) => {
      if (!result.loggedIn) {
        router.replace("/account/login");
        return;
      }
      myAddresses().then(setAddresses).catch(() => setAddresses([]));
    });
  }, [router]);

  if (!addresses) return <div className="mx-auto max-w-2xl px-4 py-10">…</div>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-surface-foreground">{locale === "bn" ? "ঠিকানা" : "Addresses"}</h1>
      {addresses.length === 0 && <p className="text-sm text-surface-foreground/60">{locale === "bn" ? "কোনো সংরক্ষিত ঠিকানা নেই।" : "No saved addresses yet."}</p>}
      <div className="space-y-3">
        {addresses.map((address) => (
          <div key={address.id} className="flex items-start justify-between rounded-theme border border-border p-3 text-sm">
            <div>
              <p className="font-medium text-surface-foreground">
                {address.recipientName} {address.isDefault && <span className="text-xs text-brand">({locale === "bn" ? "ডিফল্ট" : "default"})</span>}
              </p>
              <p className="text-surface-foreground/70">{address.phone}</p>
              <p className="text-surface-foreground/70">
                {address.addressLine}
                {address.landmark ? `, ${address.landmark}` : ""}
              </p>
            </div>
            <button onClick={() => deleteAddress(address.id).then(() => setAddresses((prev) => prev?.filter((a) => a.id !== address.id) ?? null))} className="text-xs text-danger underline">
              {locale === "bn" ? "সরান" : "Remove"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
