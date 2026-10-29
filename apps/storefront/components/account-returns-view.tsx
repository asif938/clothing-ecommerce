"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Link, useRouter } from "../i18n/navigation";
import { me } from "../lib/account-api";
import { myReturns, type ReturnSummary } from "../lib/returns-api";

/** §6.10 "customer requests from account" — the list of a customer's own return/exchange requests. */
export function AccountReturnsView() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "bn";
  const router = useRouter();
  const [returns, setReturns] = useState<ReturnSummary[] | null>(null);

  useEffect(() => {
    me().then((result) => {
      if (!result.loggedIn) {
        router.replace("/account/login");
        return;
      }
      myReturns()
        .then(setReturns)
        .catch(() => setReturns([]));
    });
  }, [router]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-surface-foreground">{locale === "bn" ? "রিটার্ন ও এক্সচেঞ্জ" : "Returns & exchanges"}</h1>
      <Link href="/account" className="mb-6 block text-sm text-brand underline">
        {locale === "bn" ? "অ্যাকাউন্টে ফিরুন" : "Back to account"}
      </Link>
      {returns?.length === 0 && <p className="text-sm text-surface-foreground/60">{locale === "bn" ? "কোনো রিটার্ন অনুরোধ নেই।" : "No return requests yet."}</p>}
      <div className="divide-y divide-border border-y border-border">
        {returns?.map((r) => (
          <div key={r.id} className="flex items-center justify-between py-3 text-sm">
            <span className="font-medium text-surface-foreground">{r.type}</span>
            <span className="text-surface-foreground/60">{r.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
