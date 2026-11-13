"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { dateInput, localized, money, parseTaka, shortDate, takaInput, type Localized } from "../../../../../lib/format";
import { Banner, Button, Card, FieldLabel, TextField } from "../../../../../components/ui";
import { FinanceTabs } from "../../../../../components/finance-tabs";

interface Category {
  key: string;
  label: Localized;
}
interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  note: string | null;
  supplier: { id: string; name: string } | null;
}
interface ExpenseList {
  rows: Expense[];
  byCategory: { category: string; amount: number; count: number }[];
  total: number;
  categories: Category[];
}

const monthStart = () => {
  const now = new Date();
  return dateInput(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)));
};

/** Operating expenses feeding the P&L (§8.2 Finance "expenses", §16 M17). */
export default function ExpensesPage() {
  const t = useTranslations("expenses");
  const locale = useLocale();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [category, setCategory] = useState("");
  const [data, setData] = useState<ExpenseList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(() => dateInput(new Date()));
  const [formCategory, setFormCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const query = useCallback(() => new URLSearchParams({ from, to, ...(category ? { category } : {}) }), [from, to, category]);

  const load = useCallback(async () => {
    try {
      setData(await api.get<ExpenseList>(`/admin/finance/expenses?${query().toString()}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload when the filters change.
    void load();
  }, [load]);

  const label = (key: string) => {
    const found = data?.categories.find((c) => c.key === key);
    return found ? localized(found.label, locale) : key;
  };

  function reset() {
    setEditingId(null);
    setAmount("");
    setNote("");
  }

  async function save() {
    const poisha = parseTaka(amount);
    if (poisha === null || poisha <= 0) {
      setError(t("amountInvalid"));
      return;
    }
    const chosen = formCategory || data?.categories[0]?.key;
    if (!chosen) return;
    setSaving(true);
    setError(null);
    try {
      const body = { date, category: chosen, amount: poisha, note: note.trim() || null };
      if (editingId) await api.patch(`/admin/finance/expenses/${editingId}`, body);
      else await api.post("/admin/finance/expenses", body);
      reset();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function edit(expense: Expense) {
    setEditingId(expense.id);
    setDate(expense.date);
    setFormCategory(expense.category);
    setAmount(takaInput(expense.amount));
    setNote(expense.note ?? "");
  }

  async function remove(expense: Expense) {
    if (!window.confirm(t("deleteConfirm", { amount: money(expense.amount), category: label(expense.category) }))) return;
    try {
      await api.delete(`/admin/finance/expenses/${expense.id}`);
      if (editingId === expense.id) reset();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete");
    }
  }

  const exportUrl = `/api/v1/admin/finance/expenses?${new URLSearchParams({ ...Object.fromEntries(query()), format: "csv" }).toString()}`;

  return (
    <div className="flex flex-col gap-6">
      <FinanceTabs />
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-4">
        <h2 className="font-medium text-surface-foreground">{editingId ? t("editExpense") : t("newExpense")}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <TextField label={t("date")} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <FieldLabel>
            {t("category")}
            <select
              value={formCategory || data?.categories[0]?.key || ""}
              onChange={(e) => setFormCategory(e.target.value)}
              className="rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground"
            >
              {data?.categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {localized(c.label, locale)}
                </option>
              ))}
              {editingId && formCategory && !data?.categories.some((c) => c.key === formCategory) && <option value={formCategory}>{formCategory}</option>}
            </select>
          </FieldLabel>
          <TextField label={t("amount")} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          <TextField label={t("note")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving || !data}>
            {editingId ? t("saveChanges") : t("addExpense")}
          </Button>
          {editingId && (
            <Button variant="secondary" onClick={reset}>
              {t("cancel")}
            </Button>
          )}
        </div>
        <p className="text-xs text-surface-foreground/50">{t("categoriesHint")}</p>
      </Card>

      <div className="flex flex-wrap items-end gap-2">
        <TextField label={t("from")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label={t("to")} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <FieldLabel>
          {t("category")}
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground">
            <option value="">{t("allCategories")}</option>
            {data?.categories.map((c) => (
              <option key={c.key} value={c.key}>
                {localized(c.label, locale)}
              </option>
            ))}
          </select>
        </FieldLabel>
        <a href={exportUrl} download className="rounded-theme bg-muted px-4 py-2 text-sm text-surface-foreground hover:opacity-80">
          {t("exportCsv")}
        </a>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card>
              <p className="text-xs text-surface-foreground/60">{t("total")}</p>
              <p className="text-xl font-semibold text-surface-foreground">{money(data.total)}</p>
            </Card>
            {data.byCategory.slice(0, 3).map((c) => (
              <Card key={c.category}>
                <p className="text-xs text-surface-foreground/60">{label(c.category)}</p>
                <p className="text-xl font-semibold text-surface-foreground">{money(c.amount)}</p>
              </Card>
            ))}
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
                  <th className="py-2 pr-4">{t("date")}</th>
                  <th className="py-2 pr-4">{t("category")}</th>
                  <th className="py-2 pr-4">{t("amount")}</th>
                  <th className="py-2 pr-4">{t("note")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-b-0">
                    <td className="py-2 pr-4 text-surface-foreground">{shortDate(e.date)}</td>
                    <td className="py-2 pr-4 text-surface-foreground/80">{label(e.category)}</td>
                    <td className="py-2 pr-4 font-medium text-surface-foreground">{money(e.amount)}</td>
                    <td className="py-2 pr-4 text-surface-foreground/70">{e.note}</td>
                    <td className="flex gap-2 py-2">
                      <button onClick={() => edit(e)} className="text-brand hover:underline">
                        {t("edit")}
                      </button>
                      <button onClick={() => remove(e)} className="text-danger hover:underline">
                        {t("delete")}
                      </button>
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-surface-foreground/50">
                      {t("none")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
