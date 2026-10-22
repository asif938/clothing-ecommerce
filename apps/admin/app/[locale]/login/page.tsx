"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../../i18n/navigation";
import { api, ApiError } from "../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../components/ui";

type LoginResponse = { requiresTotp: true; loginToken: string } | { requiresTotp: false };

export default function LoginPage() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [step, setStep] = useState<"credentials" | "totp">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginToken, setLoginToken] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<LoginResponse>("/auth/login", { email, password });
      if (result.requiresTotp) {
        setLoginToken(result.loginToken);
        setStep("totp");
      } else {
        router.push("/");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleTotp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/login/totp", { loginToken, code });
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        {step === "credentials" ? (
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold text-surface-foreground">{t("loginTitle")}</h1>
            {error && <Banner kind="error">{error}</Banner>}
            <TextField label={t("email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <TextField label={t("password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" disabled={busy}>
              {busy ? tCommon("loading") : t("submit")}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleTotp} className="flex flex-col gap-4">
            <h1 className="text-xl font-semibold text-surface-foreground">{t("totpTitle")}</h1>
            <p className="text-sm text-surface-foreground/70">{t("totpPrompt")}</p>
            {error && <Banner kind="error">{error}</Banner>}
            <TextField label="Code" value={code} onChange={(e) => setCode(e.target.value)} minLength={6} maxLength={6} required />
            <Button type="submit" disabled={busy}>
              {busy ? tCommon("loading") : tCommon("confirm")}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
