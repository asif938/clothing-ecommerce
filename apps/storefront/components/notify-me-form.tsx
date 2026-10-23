"use client";

import { useState } from "react";

/** "Notify me" for an out-of-stock size/variant (docs/PROJECT_SPEC.md §7.4). */
export function NotifyMeForm({ variantId, locale }: { variantId: string; locale: string }) {
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    try {
      const response = await fetch("/api/v1/store/notify-me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, channel, [channel === "sms" ? "contactPhone" : "contactEmail"]: contact }),
      });
      setStatus(response.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return <p className="text-sm text-success">{locale === "bn" ? "ধন্যবাদ! স্টকে আসলে জানানো হবে।" : "Thanks! We'll let you know when it's back."}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2 text-xs">
        <label className="flex items-center gap-1">
          <input type="radio" checked={channel === "sms"} onChange={() => setChannel("sms")} /> SMS
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={channel === "email"} onChange={() => setChannel("email")} /> Email
        </label>
      </div>
      <div className="flex gap-2">
        <input
          required
          type={channel === "sms" ? "tel" : "email"}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={channel === "sms" ? "01xxxxxxxxx" : "you@example.com"}
          className="flex-1 rounded-theme border border-border bg-surface px-3 py-2 text-sm"
        />
        <button type="submit" disabled={status === "sending"} className="rounded-theme bg-brand px-4 py-2 text-sm text-brand-foreground disabled:opacity-50">
          {locale === "bn" ? "জানান" : "Notify me"}
        </button>
      </div>
      {status === "error" && <p className="text-xs text-danger">{locale === "bn" ? "কিছু ভুল হয়েছে" : "Something went wrong"}</p>}
    </form>
  );
}
