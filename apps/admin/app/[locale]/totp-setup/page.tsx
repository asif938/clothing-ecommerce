"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../../i18n/navigation";
import { api, ApiError } from "../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../components/ui";

interface TotpSetupResponse {
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

/**
 * §12 "mandatory TOTP 2FA for all staff" — StaffAuthGuard locks every other
 * route out (403 `TOTP_SETUP_REQUIRED`) until this page's flow finishes, so
 * any staff account created without 2FA already enabled lands here first.
 */
export default function TotpSetupPage() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [setupResult, setSetupResult] = useState<TotpSetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .post<TotpSetupResponse>("/auth/totp/setup")
      .then(setSetupResult)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Something went wrong"));
  }, []);

  async function handleConfirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/totp/confirm", { code });
      setDone(true);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        {done ? (
          <p className="text-center text-sm text-surface-foreground/70">{t("totpRequiredDone")}</p>
        ) : (
          <form onSubmit={handleConfirm} className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold text-surface-foreground">{t("totpRequiredTitle")}</h1>
            <p className="text-sm text-surface-foreground/70">{t("totpRequiredBody")}</p>
            {error && <Banner kind="error">{error}</Banner>}
            {setupResult && (
              // eslint-disable-next-line @next/next/no-img-element -- data: URL, not an optimizable remote image
              <img src={setupResult.qrCodeDataUrl} alt="TOTP QR code" className="mx-auto h-48 w-48" />
            )}
            <TextField label="Code" value={code} onChange={(e) => setCode(e.target.value)} minLength={6} maxLength={6} required />
            <Button type="submit" disabled={busy || !setupResult}>
              {busy ? tCommon("loading") : tCommon("confirm")}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
