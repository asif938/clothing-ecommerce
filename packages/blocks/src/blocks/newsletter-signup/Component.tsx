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
    <section className="mx-auto my-12 flex max-w-xl flex-col items-center gap-4 px-4 py-12 text-center sm:my-20 sm:px-8">
      {props.heading && <h2 className="text-balance text-3xl leading-tight text-surface-foreground sm:text-4xl">{t(props.heading, locale as "bn" | "en")}</h2>}
      {props.body && <p className="text-pretty text-surface-foreground/70">{t(props.body, locale as "bn" | "en")}</p>}
      {status === "done" ? (
        <p className="text-sm text-success">{locale === "bn" ? "ধন্যবাদ!" : "Thanks for subscribing!"}</p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-2 flex w-full max-w-md flex-col gap-2 sm:flex-row">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={locale === "bn" ? "আপনার ইমেইল" : "Your email"}
            className="h-12 w-full rounded-theme sm:w-auto sm:flex-1 border border-border bg-surface px-4 text-sm outline-none transition-colors focus:border-brand"
          />
          <button type="submit" disabled={status === "sending"} className="h-12 rounded-theme bg-brand px-6 text-sm font-medium tracking-wide text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {locale === "bn" ? "সাবস্ক্রাইব" : "Subscribe"}
          </button>
        </form>
      )}
      {status === "error" && <p className="text-sm text-danger">{locale === "bn" ? "কিছু ভুল হয়েছে" : "Something went wrong"}</p>}
    </section>
  );
}
