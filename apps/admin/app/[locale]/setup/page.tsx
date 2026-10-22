"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../../i18n/navigation";
import { api, ApiError } from "../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../components/ui";

interface SuperAdminSetupResponse {
  staffUserId: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export default function SetupPage() {
  const t = useTranslations("setup");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [step, setStep] = useState<"form" | "totp" | "done">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupResult, setSetupResult] = useState<SuperAdminSetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreateSuperAdmin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<SuperAdminSetupResponse>("/setup/super-admin", { name, email, password });
      setSetupResult(result);
      setStep("totp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmTotp(event: React.FormEvent) {
    event.preventDefault();
    if (!setupResult) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/setup/super-admin/confirm-totp", { staffUserId: setupResult.staffUserId, code });
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        {step === "form" && (
          <form onSubmit={handleCreateSuperAdmin} className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold text-surface-foreground">{t("superAdminTitle")}</h1>
            <p className="text-sm text-surface-foreground/70">{t("welcomeBody")}</p>
            {error && <Banner kind="error">{error}</Banner>}
            <TextField label={t("name")} value={name} onChange={(e) => setName(e.target.value)} required />
            <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={10}
              required
            />
            <Button type="submit" disabled={busy}>
              {busy ? tCommon("loading") : tCommon("next")}
            </Button>
          </form>
        )}

        {step === "totp" && setupResult && (
          <form onSubmit={handleConfirmTotp} className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold text-surface-foreground">{t("totpTitle")}</h1>
            <p className="text-sm text-surface-foreground/70">{t("totpPrompt")}</p>
            {error && <Banner kind="error">{error}</Banner>}
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, not an optimizable remote image */}
            <img src={setupResult.qrCodeDataUrl} alt="TOTP QR code" className="mx-auto h-48 w-48" />
            <TextField label="Code" value={code} onChange={(e) => setCode(e.target.value)} minLength={6} maxLength={6} required />
            <Button type="submit" disabled={busy}>
              {busy ? tCommon("loading") : tCommon("confirm")}
            </Button>
          </form>
        )}

        {step === "done" && (
          <div className="flex flex-col gap-4 text-center">
            <h1 className="text-xl font-semibold text-surface-foreground">{t("doneTitle")}</h1>
            <p className="text-sm text-surface-foreground/70">{t("doneBody")}</p>
            <Button onClick={() => router.push("/login")}>{t("goToLogin")}</Button>
          </div>
        )}
      </Card>
    </main>
  );
}
