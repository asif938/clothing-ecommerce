"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Link, useRouter } from "../i18n/navigation";
import { formatBdt } from "../lib/money";
import { me, myOrders, logout, type OrderSummary } from "../lib/account-api";

export function AccountView() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "bn";
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    me().then((result) => {
      if (!result.loggedIn) {
        router.replace("/account/login");
        return;
      }
      setPhone(result.phone ?? null);
      myOrders().then(setOrders).catch(() => setOrders([]));
      setChecked(true);
    });
  }, [router]);

  if (!checked) return <div className="mx-auto max-w-2xl px-4 py-10">…</div>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-surface-foreground">{locale === "bn" ? "আমার অ্যাকাউন্ট" : "My account"}</h1>
        <button
          onClick={() => logout().then(() => router.push("/"))}
          className="text-sm text-surface-foreground/60 underline"
        >
          {locale === "bn" ? "লগ আউট" : "Log out"}
        </button>
      </div>
      {phone && <p className="mb-6 text-sm text-surface-foreground/70">{phone}</p>}

      <div className="mb-6 flex gap-4">
        <Link href="/account/addresses" className="block text-sm text-brand underline">
          {locale === "bn" ? "ঠিকানা পরিচালনা করুন" : "Manage addresses"}
        </Link>
        <Link href="/account/returns" className="block text-sm text-brand underline">
          {locale === "bn" ? "রিটার্ন ও এক্সচেঞ্জ" : "Returns & exchanges"}
        </Link>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-surface-foreground">{locale === "bn" ? "অর্ডারসমূহ" : "Orders"}</h2>
      {orders?.length === 0 && <p className="text-sm text-surface-foreground/60">{locale === "bn" ? "কোনো অর্ডার নেই।" : "No orders yet."}</p>}
      <div className="divide-y divide-border border-y border-border">
        {orders?.map((order) => (
          <div key={order.id} className="flex items-center justify-between py-3 text-sm">
            <div>
              <p className="font-medium text-surface-foreground">{order.orderNumber}</p>
              <p className="text-surface-foreground/60">{order.status}</p>
            </div>
            <div className="flex items-center gap-3">
              <p>{formatBdt(order.total)}</p>
              {["delivered", "partially_delivered", "completed"].includes(order.status) && (
                <>
                  <Link href={`/account/orders/${order.id}/reviews`} className="text-xs text-brand underline">
                    {locale === "bn" ? "রিভিউ লিখুন" : "Write a review"}
                  </Link>
                  <Link href={`/account/returns/new?orderId=${order.id}`} className="text-xs text-brand underline">
                    {locale === "bn" ? "রিটার্ন অনুরোধ" : "Request return"}
                  </Link>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
