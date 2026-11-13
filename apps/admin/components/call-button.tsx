"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../lib/api";
import { useCurrentStaff } from "../lib/use-current-staff";

/**
 * Click-to-call (§8.2 call-centre tools, §16 M15). With a telephony
 * provider the API rings the agent's phone and bridges to the customer;
 * without one it logs the call and we open a `tel:` link. Hidden for staff
 * without `support.calls` (they still see the number itself).
 */
export function CallButton({ phone, orderId, customerId, conversationId }: { phone: string | null | undefined; orderId?: string; customerId?: string; conversationId?: string }) {
  const t = useTranslations("calls");
  const { hasPermission } = useCurrentStaff();
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ringing" | "error"; message?: string }>({ kind: "idle" });

  if (!phone || !hasPermission("support.calls")) return null;

  async function call() {
    setState({ kind: "busy" });
    try {
      const result = await api.post<{ mode: "provider" | "tel"; telUrl: string }>("/admin/support/calls", { phone, orderId, customerId, conversationId });
      if (result.mode === "tel") {
        window.location.href = result.telUrl;
        setState({ kind: "idle" });
      } else {
        setState({ kind: "ringing", message: t("ringingYou") });
      }
    } catch (err) {
      setState({ kind: "error", message: err instanceof ApiError ? err.message : t("failed") });
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void call()} disabled={state.kind === "busy"} className="rounded-theme border border-border px-2 py-1 text-xs font-medium text-surface-foreground hover:bg-muted disabled:opacity-50">
        {state.kind === "busy" ? t("calling") : t("call")}
      </button>
      {state.message && <span className={`text-xs ${state.kind === "error" ? "text-danger" : "text-success"}`}>{state.message}</span>}
    </span>
  );
}
