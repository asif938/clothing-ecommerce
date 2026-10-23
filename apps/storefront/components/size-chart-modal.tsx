"use client";

import { t } from "@clothing/shared";
import type { SizeChartData } from "../lib/store-api";

/** Size chart modal (docs/PROJECT_SPEC.md §7.4) — unit toggle and "how to measure" image are the richer version the Design/CMS work could add later; this covers the table itself, which is what the PDP's size buttons actually need. */
export function SizeChartModal({ sizeChart, locale, onClose }: { sizeChart: SizeChartData; locale: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-theme bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-surface-foreground">{t(sizeChart.name, locale as "bn" | "en")}</h2>
          <button onClick={onClose} className="text-surface-foreground/60">
            ×
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4">{locale === "bn" ? "সাইজ" : "Size"}</th>
                {sizeChart.columns.map((column) => (
                  <th key={column.key} className="py-2 pr-4">
                    {t(column.label, locale as "bn" | "en")} ({sizeChart.unitDefault})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sizeChart.rows.map((row) => (
                <tr key={row.size} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 font-medium text-surface-foreground">{row.size}</td>
                  {sizeChart.columns.map((column) => (
                    <td key={column.key} className="py-2 pr-4 text-surface-foreground/70">
                      {row.measurements[column.key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sizeChart.notes && <p className="mt-4 text-xs text-surface-foreground/60">{t(sizeChart.notes, locale as "bn" | "en")}</p>}
      </div>
    </div>
  );
}
