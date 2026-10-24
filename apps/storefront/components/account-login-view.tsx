"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "../i18n/navigation";
import { sendLoginOtp, verifyLoginOtp } from "../lib/account-api";

/** §6.13 OTP customer login. Google sign-in is a button the storefront would mount Google Identity Services for — not added here since that's a third-party script load decision best made alongside real branding/consent UI, not a bare `<script>` tag; the API side (`POST /store/auth/google`) is already built and ready for it. */
export function AccountLoginView() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "bn";
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      const result = await sendLoginOtp(phone);
      setSent(true);
      setDevCode(result.devCode ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setBusy(true);
    setError(null);
    try {
      const result = await verifyLoginOtp(phone, code);
      if (result.verified) router.push("/account");
      else setError(locale === "bn" ? "ভুল কোড" : "Incorrect code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold text-surface-foreground">{locale === "bn" ? "লগ ইন" : "Log in"}</h1>
      <div className="space-y-3">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={sent} placeholder={locale === "bn" ? "মোবাইল নম্বর" : "Mobile number"} className="w-full rounded-theme border border-border px-3 py-2 text-sm" />
        {!sent ? (
          <button onClick={handleSend} disabled={busy || !phone} className="w-full rounded-theme bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60">
            {locale === "bn" ? "কোড পাঠান" : "Send code"}
          </button>
        ) : (
          <>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={locale === "bn" ? "যাচাইকরণ কোড" : "Verification code"} className="w-full rounded-theme border border-border px-3 py-2 text-sm" />
            {devCode && <p className="text-xs text-surface-foreground/50">dev code: {devCode}</p>}
            <button onClick={handleVerify} disabled={busy || !code} className="w-full rounded-theme bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60">
              {locale === "bn" ? "যাচাই করুন" : "Verify"}
            </button>
          </>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
