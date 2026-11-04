"use client";

import { useEffect, useState } from "react";

interface Question {
  id: string;
  question: string;
  answer: string | null;
}

/** Product Q&A (docs/PROJECT_SPEC.md §5.5 `product_questions`, §16 M8). Guests can ask (no login required — `customer_id` is nullable), same as the spec's own domain model allows. */
export function ProductQnA({ productId, locale }: { productId: string; locale: string }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  function load() {
    fetch(`/api/v1/store/product-questions/products/${productId}`)
      .then((r) => r.json())
      .then((result: Question[]) => setQuestions(result))
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setStatus("sending");
    try {
      const response = await fetch("/api/v1/store/product-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, question: draft }),
      });
      if (response.ok) {
        setDraft("");
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="mt-10 border-t border-border pt-6">
      <h2 className="mb-4 text-lg font-semibold text-surface-foreground">{locale === "bn" ? "প্রশ্ন ও উত্তর" : "Questions & Answers"}</h2>
      <div className="flex flex-col gap-3">
        {questions.map((q) => (
          <div key={q.id} className="rounded-theme border border-border p-3 text-sm">
            <p className="font-medium text-surface-foreground">Q: {q.question}</p>
            <p className="mt-1 text-surface-foreground/70">A: {q.answer}</p>
          </div>
        ))}
        {questions.length === 0 && <p className="text-sm text-surface-foreground/50">{locale === "bn" ? "এখনো কোনো প্রশ্ন নেই।" : "No questions yet."}</p>}
      </div>
      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={locale === "bn" ? "আপনার প্রশ্ন লিখুন…" : "Ask a question…"}
          className="flex-1 rounded-theme border border-border bg-surface px-3 py-2 text-sm"
        />
        <button type="submit" disabled={status === "sending"} className="rounded-theme bg-brand px-4 py-2 text-sm text-brand-foreground disabled:opacity-50">
          {locale === "bn" ? "জিজ্ঞাসা করুন" : "Ask"}
        </button>
      </form>
      {status === "done" && <p className="mt-1 text-xs text-success">{locale === "bn" ? "ধন্যবাদ! উত্তর পাওয়ার পর এখানে দেখানো হবে।" : "Thanks! It'll show here once answered."}</p>}
      {status === "error" && <p className="mt-1 text-xs text-danger">{locale === "bn" ? "কিছু ভুল হয়েছে" : "Something went wrong"}</p>}
    </section>
  );
}
