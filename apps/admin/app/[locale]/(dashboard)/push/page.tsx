"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../components/ui";

interface PushStatus {
  configured: boolean;
  subscriptionCount: number;
}

/** Web push admin (docs/PROJECT_SPEC.md §16 M10) — VAPID keys live in the settings registry, but generating them is a one-off action (`web-push`'s own keygen), not a value an admin would type in, hence this small dedicated page rather than a generic settings field. */
export default function PushPage() {
  const t = useTranslations("push");
  const tCommon = useTranslations("common");
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [testTitle, setTestTitle] = useState("");
  const [testBody, setTestBody] = useState("");
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await api.get<PushStatus>("/admin/push/status"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load push status");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount.
    void load();
  }, [load]);

  async function handleGenerate() {
    setError(null);
    try {
      await api.post("/admin/push/generate-vapid-keys", {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate keys");
    }
  }

  async function handleSendTest() {
    setError(null);
    setSent(false);
    try {
      await api.post("/admin/push/send-test", { customerId, title: testTitle, body: testBody });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <p className="text-sm text-surface-foreground">
          {t("status")}: {status?.configured ? t("configured") : t("notConfigured")}
        </p>
        <p className="text-sm text-surface-foreground">
          {t("subscriptionCount")}: {status?.subscriptionCount ?? 0}
        </p>
        <p className="text-xs text-surface-foreground/60">{t("generateWarning")}</p>
        <Button onClick={() => void handleGenerate()}>{t("generateKeys")}</Button>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("sendTestTitle")}</h2>
        <TextField label={t("customerId")} value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
        <TextField label={t("testTitle")} value={testTitle} onChange={(e) => setTestTitle(e.target.value)} />
        <TextField label={t("testBody")} value={testBody} onChange={(e) => setTestBody(e.target.value)} />
        <Button variant="secondary" onClick={() => void handleSendTest()}>
          {t("send")}
        </Button>
        {sent && <span className="text-sm text-success">{t("sent")}</span>}
      </Card>
      {!status && <p className="text-sm text-surface-foreground/60">{tCommon("loading")}</p>}
    </div>
  );
}
