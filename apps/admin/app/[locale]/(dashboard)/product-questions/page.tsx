"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card } from "../../../../components/ui";

interface QuestionRow {
  id: string;
  question: string;
  answer: string | null;
  status: "pending" | "answered" | "hidden";
  product: { title: { bn?: string; en?: string }; slug: string };
  customer: { name: string | null; phone: string | null } | null;
}

export default function ProductQuestionsPage() {
  const t = useTranslations("productQuestions");
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function load() {
    try {
      const result = await api.get<{ items: QuestionRow[] }>("/admin/product-questions?status=pending");
      setRows(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load questions");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  async function answer(id: string) {
    const answerText = drafts[id];
    if (!answerText) return;
    try {
      await api.patch(`/admin/product-questions/${id}/answer`, { answer: answerText });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to answer question");
    }
  }

  async function hide(id: string) {
    try {
      await api.patch(`/admin/product-questions/${id}/hide`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to hide question");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}
      <Card className="flex flex-col gap-3">
        {rows.map((question) => (
          <div key={question.id} className="rounded-theme border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-surface-foreground">{question.product.title.en ?? question.product.title.bn}</span>
              <span className="text-xs text-surface-foreground/50">{question.customer?.name ?? question.customer?.phone ?? t("guest")}</span>
            </div>
            <p className="mt-1 text-sm text-surface-foreground/80">{question.question}</p>
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                value={drafts[question.id] ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [question.id]: e.target.value }))}
                rows={2}
                className="rounded-theme border border-border bg-surface px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <Button onClick={() => void answer(question.id)} disabled={!drafts[question.id]}>{t("answer")}</Button>
                <Button variant="secondary" onClick={() => void hide(question.id)}>{t("hide")}</Button>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-surface-foreground/50">—</p>}
      </Card>
    </div>
  );
}
