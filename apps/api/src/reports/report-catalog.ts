/**
 * Reports that can be emailed on a schedule (§8.2 "Scheduled email reports",
 * §16 M12). Each entry names the permission needed to *schedule* it — a
 * schedule emails data to arbitrary addresses, so creating one must require
 * the same right as viewing that data in admin.
 */
export const SCHEDULABLE_REPORTS = {
  sales: { permission: "reports.read", title: { bn: "বিক্রয় (দৈনিক)", en: "Sales by day" } },
  products: { permission: "reports.read", title: { bn: "শীর্ষ পণ্য", en: "Top products" } },
  courier: { permission: "reports.read", title: { bn: "কুরিয়ার পারফরম্যান্স", en: "Courier performance" } },
  staff: { permission: "reports.read", title: { bn: "স্টাফ পারফরম্যান্স", en: "Staff performance" } },
  discounts: { permission: "reports.read", title: { bn: "ডিসকাউন্ট ব্যবহার", en: "Discount usage" } },
  search_terms: { permission: "reports.read", title: { bn: "সার্চ টার্ম", en: "Search terms" } },
  profit: { permission: "finance.profit.read", title: { bn: "প্রকৃত মুনাফা", en: "True profit" } },
  cod_outstanding: { permission: "finance.manage", title: { bn: "কুরিয়ারের কাছে বকেয়া COD", en: "COD outstanding with couriers" } },
} as const;

export type SchedulableReportKey = keyof typeof SCHEDULABLE_REPORTS;
export const SCHEDULABLE_REPORT_KEYS = Object.keys(SCHEDULABLE_REPORTS) as [SchedulableReportKey, ...SchedulableReportKey[]];

export interface ReportColumn {
  key: string;
  header: { bn: string; en: string };
  money?: boolean;
  percent?: boolean;
}

export interface RenderedReport {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** ৳ whole taka with standard grouping — spec §17 currency display default. */
export function formatTaka(poisha: number): string {
  const taka = Math.round(poisha / 100);
  return `৳${taka.toLocaleString("en-US")}`;
}

function formatCell(value: unknown, column: ReportColumn): string {
  if (value === null || value === undefined) return "";
  if (column.money && typeof value === "number") return formatTaka(value);
  if (column.percent && typeof value === "number") return `${(value * 100).toFixed(1)}%`;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/** An email-safe HTML table (inline styles only — most mail clients strip <style>). Every value is escaped. */
export function renderReportHtml(title: string, periodLabel: string, report: RenderedReport, locale: "bn" | "en", emptyText: string, maxRows = 200): string {
  const head = report.columns.map((c) => `<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #ddd;font-size:12px">${escapeHtml(c.header[locale])}</th>`).join("");
  const body = report.rows
    .slice(0, maxRows)
    .map((row) => `<tr>${report.columns.map((c) => `<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px">${escapeHtml(formatCell(row[c.key], c))}</td>`).join("")}</tr>`)
    .join("");
  const table = report.rows.length === 0 ? `<p>${escapeHtml(emptyText)}</p>` : `<table style="border-collapse:collapse;width:100%">${head ? `<thead><tr>${head}</tr></thead>` : ""}<tbody>${body}</tbody></table>`;
  const truncated = report.rows.length > maxRows ? `<p style="color:#888;font-size:12px">… +${report.rows.length - maxRows}</p>` : "";
  return `<div style="font-family:Arial,sans-serif"><h2 style="margin:0 0 4px">${escapeHtml(title)}</h2><p style="color:#666;margin:0 0 16px">${escapeHtml(periodLabel)}</p>${table}${truncated}</div>`;
}
