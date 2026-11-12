"use client";

import { useLocale, useTranslations } from "next-intl";
import { VariantPicker, variantLabel, type VariantOption } from "./variant-picker";
import { money, parseTaka, takaInput } from "../lib/format";

export interface LineItem {
  variant: Pick<VariantOption, "id" | "sku" | "title" | "options">;
  quantity: number;
  /** Poisha; only used when `withCost` is set. */
  unitCost?: number;
}

/** Editable list of variant + quantity (+ unit cost) lines, used by purchase orders and stock transfers. */
export function LineItemsEditor({ items, onChange, withCost = false }: { items: LineItem[]; onChange: (items: LineItem[]) => void; withCost?: boolean }) {
  const t = useTranslations("m12");
  const locale = useLocale();

  function add(variant: VariantOption) {
    if (items.some((i) => i.variant.id === variant.id)) return;
    onChange([...items, { variant, quantity: 1, ...(withCost ? { unitCost: 0 } : {}) }]);
  }

  function update(index: number, patch: Partial<LineItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  const total = items.reduce((sum, i) => sum + i.quantity * (i.unitCost ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <VariantPicker onPick={add} />
      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
                <th className="py-2 pr-4">{t("variant")}</th>
                <th className="py-2 pr-4">{t("quantity")}</th>
                {withCost && <th className="py-2 pr-4">{t("unitCost")}</th>}
                {withCost && <th className="py-2 pr-4">{t("lineTotal")}</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.variant.id} className="border-b border-border last:border-b-0">
                  <td className="py-2 pr-4 text-surface-foreground">{variantLabel(item.variant, locale)}</td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => update(index, { quantity: Math.max(1, Number.parseInt(e.target.value || "1", 10)) })}
                      className="w-24 rounded-theme border border-border bg-surface px-2 py-1 text-sm text-surface-foreground"
                    />
                  </td>
                  {withCost && (
                    <td className="py-2 pr-4">
                      <input
                        inputMode="decimal"
                        defaultValue={takaInput(item.unitCost)}
                        onBlur={(e) => update(index, { unitCost: parseTaka(e.target.value) ?? 0 })}
                        className="w-28 rounded-theme border border-border bg-surface px-2 py-1 text-sm text-surface-foreground"
                      />
                    </td>
                  )}
                  {withCost && <td className="py-2 pr-4 text-surface-foreground/70">{money(item.quantity * (item.unitCost ?? 0))}</td>}
                  <td className="py-2 text-right">
                    <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))} className="text-xs text-danger hover:underline">
                      {t("removeLine")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {withCost && <p className="mt-2 text-right text-sm font-medium text-surface-foreground">{t("total")}: {money(total)}</p>}
        </div>
      )}
    </div>
  );
}
