import { z } from "zod";

const MAX_FILE_BASE64 = 14_000_000; // ~10 MB decoded

export const inspectFileSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentBase64: z.string().min(1).max(MAX_FILE_BASE64),
});
export type InspectFileDto = z.infer<typeof inspectFileSchema>;

const settlementMeta = {
  courierProviderInstanceId: z.string().min(1).nullable().optional(),
  settlementRef: z.string().trim().max(120).nullable().optional(),
  periodFrom: z.coerce.date().nullable().optional(),
  periodTo: z.coerce.date().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
};

export const importCodFileSchema = inspectFileSchema.extend({
  ...settlementMeta,
  /** Courier name for a "manual" courier or when no provider instance applies; ignored when `courierProviderInstanceId` is set. */
  courierDriver: z.string().trim().min(1).max(60).default("manual"),
  mapping: z.object({
    consignmentId: z.string().trim().min(1),
    collected: z.string().trim().min(1),
    charge: z.string().trim().min(1).nullable().optional(),
  }),
});
export type ImportCodFileDto = z.infer<typeof importCodFileSchema>;

export const fetchCodApiSchema = z.object({
  courierProviderInstanceId: z.string().min(1),
  settlementRef: settlementMeta.settlementRef,
  note: settlementMeta.note,
});
export type FetchCodApiDto = z.infer<typeof fetchCodApiSchema>;

export const updateCodLineSchema = z.object({
  /** Manually pin the line to a shipment (by id) when auto-match failed; null unlinks. */
  shipmentId: z.string().min(1).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type UpdateCodLineDto = z.infer<typeof updateCodLineSchema>;

export const confirmCodSettlementSchema = z.object({
  receivedAmount: z.number().int().nullable().optional(),
  receivedAt: z.coerce.date().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type ConfirmCodSettlementDto = z.infer<typeof confirmCodSettlementSchema>;

export const listCodSettlementsQuerySchema = z.object({ status: z.enum(["draft", "confirmed"]).optional() });
export type ListCodSettlementsQueryDto = z.infer<typeof listCodSettlementsQuerySchema>;

export const gatewaySettlementSchema = z
  .object({
    method: z.enum(["sslcommerz", "bkash", "nagad", "mock"]),
    providerInstanceId: z.string().min(1).nullable().optional(),
    settlementRef: z.string().trim().max(120).nullable().optional(),
    periodFrom: z.coerce.date(),
    periodTo: z.coerce.date(),
    gross: z.number().int().min(0),
    fees: z.number().int().min(0),
    receivedAt: z.coerce.date().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((d) => d.periodTo >= d.periodFrom, { message: "Period end must be after its start", path: ["periodTo"] })
  .refine((d) => d.fees <= d.gross, { message: "Fees can't exceed gross", path: ["fees"] });
export type GatewaySettlementDto = z.infer<typeof gatewaySettlementSchema>;

export const profitQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  groupBy: z.enum(["day", "order"]).default("day"),
  format: z.enum(["json", "csv"]).default("json"),
});
export type ProfitQueryDto = z.infer<typeof profitQuerySchema>;

// ---------------------------------------------------------------------------
// §16 M17 — expenses and P&L
// ---------------------------------------------------------------------------

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const expenseSchema = z.object({
  /** The shop's calendar day the cost belongs to (Asia/Dhaka). */
  date: dateOnly,
  category: z.string().trim().min(1).max(40),
  // Poisha (golden rule 3); a refund from a supplier is recorded as a note, not a negative expense.
  amount: z.number().int().min(1).max(100_000_000_000),
  note: z.string().trim().max(500).nullable().optional(),
  attachmentUrl: z.string().trim().max(500).nullable().optional(),
  supplierId: z.string().min(1).nullable().optional(),
});
export type ExpenseDto = z.infer<typeof expenseSchema>;
export const updateExpenseSchema = expenseSchema.partial();
export type UpdateExpenseDto = z.infer<typeof updateExpenseSchema>;

export const listExpensesQuerySchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  category: z.string().trim().max(40).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});
export type ListExpensesQueryDto = z.infer<typeof listExpensesQuerySchema>;

export const pnlQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  /** `month` adds one statement per Dhaka calendar month in the range (max 12). */
  groupBy: z.enum(["total", "month"]).default("total"),
  format: z.enum(["json", "csv"]).default("json"),
});
export type PnlQueryDto = z.infer<typeof pnlQuerySchema>;
