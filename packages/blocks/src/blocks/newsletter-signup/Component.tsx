"use client";

import { useState } from "react";
import { t } from "@clothing/shared";
import type { BlockComponentProps } from "../../registry.ts";
import type { NewsletterSignupProps } from "./schema.ts";

export function NewsletterSignupBlock({ props, locale }: BlockComponentProps<NewsletterSignupProps>) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    try {
      const response = await fetch("/api/v1/store/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });
      setStatus(response.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-10 text-center">
      {props.heading && <h2 className="text-2xl font-semibold text-surface-foreground">{t(props.heading, locale as "bn" | "en")}</h2>}
      {props.body && <p className="text-surface-foreground/70">{t(props.body, locale as "bn" | "en")}</p>}
      {status === "done" ? (
        <p className="text-sm text-success">{locale === "bn" ? "ধন্যবাদ!" : "Thanks for subscribing!"}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex w-full max-w-sm gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={locale === "bn" ? "আপনার ইমেইল" : "Your email"}
            className="flex-1 rounded-theme border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button type="submit" disabled={status === "sending"} className="rounded-theme bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-50">
            {locale === "bn" ? "সাবস্ক্রাইব" : "Subscribe"}
          </button>
        </form>
      )}
      {status === "error" && <p className="text-sm text-danger">{locale === "bn" ? "কিছু ভুল হয়েছে" : "Something went wrong"}</p>}
    </section>
  );
}
