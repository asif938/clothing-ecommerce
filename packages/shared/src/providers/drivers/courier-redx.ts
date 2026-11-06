import { z } from "zod";
import type { CourierDriver, CourierStatusResult, ProviderDriverDefinition, ShipmentStatusValue } from "../types.ts";

/**
 * RedX Merchant API (docs/PROJECT_SPEC.md §10.2). Implemented against
 * RedX's documented parcel-creation and tracking endpoints (`API-ACCESS-TOKEN`
 * header, `POST /parcel`, `GET /parcel/track/:trackingId`). Not verified
 * against a live sandbox account in this environment (§10 — see
 * docs/DECISIONS.md). Re-verify endpoint paths and field names against
 * RedX's current merchant docs before going live.
 */
export const redxConfigSchema = z.object({
  apiToken: z.string().min(1),
  baseUrl: z.string().url().default("https://openapi.redx.com.bd/v1.0.0-beta"),
  /** §12 "webhook signature verification" — shared-secret header (`X-Webhook-Secret`), see courier-pathao.ts for why. */
  webhookSecret: z.string().optional(),
});
export type RedxConfig = z.infer<typeof redxConfigSchema>;

function headers(config: RedxConfig): Record<string, string> {
  return { "API-ACCESS-TOKEN": `Bearer ${config.apiToken}`, "Content-Type": "application/json" };
}

export const redxStatusMap: Record<string, ShipmentStatusValue> = {
  "pickup-pending": "booked",
  "pickup-completed": "picked_up",
  "in-transit": "in_transit",
  "delivery-pending": "out_for_delivery",
  "delivery-completed": "delivered",
  "partial-delivery": "partially_delivered",
  "delivery-cancelled": "rejected_at_door",
  "pickup-cancelled": "cancelled",
  "on-hold": "in_transit",
  "in-review": "in_transit",
  "return-to-merchant": "returned_to_sender",
};

export function createRedxDriver(config: RedxConfig): CourierDriver {
  return {
    async createParcel(input) {
      if (!input.areaCode) throw new Error("No RedX area mapping configured for this destination (see Courier area mapping in admin).");
      const response = await fetch(`${config.baseUrl}/parcel`, {
        method: "POST",
        headers: headers(config),
        body: JSON.stringify({
          merchant_invoice_id: input.reference,
          customer_name: input.recipientName,
          customer_phone: input.recipientPhone,
          customer_address: input.recipientAddress,
          delivery_area: input.areaName ?? input.areaCode,
          delivery_area_id: Number(input.areaCode),
          cash_collection_amount: Math.round(input.codAmount / 100),
          parcel_weight: Math.max(0.5, input.weightGrams / 1000),
          instruction: input.note ?? "",
          value: Math.round(input.codAmount / 100),
          parcel_details_json: [{ name: input.itemDescription, category: "Clothing", value: Math.round(input.codAmount / 100) }],
        }),
      });
      const body = (await response.json()) as { tracking_id?: string; message?: string };
      if (!response.ok || !body.tracking_id) throw new Error(body.message ?? `RedX parcel creation failed (HTTP ${response.status})`);
      return {
        consignmentId: body.tracking_id,
        trackingCode: body.tracking_id,
        trackingUrl: `https://redx.com.bd/track-parcel/?trackingId=${body.tracking_id}`,
        raw: body,
      };
    },
    async getStatus(consignmentId): Promise<CourierStatusResult> {
      const response = await fetch(`${config.baseUrl}/parcel/track/${consignmentId}`, { headers: headers(config) });
      const body = (await response.json()) as { tracking?: { status?: string }[]; message?: string };
      const rawStatus = body.tracking?.at(-1)?.status ?? "unknown";
      return { status: redxStatusMap[rawStatus] ?? "booked", rawStatus, raw: body };
    },
  };
}

export const redxDriverDefinition: ProviderDriverDefinition<RedxConfig> = {
  capability: "courier",
  driver: "redx",
  label: { bn: "রেডএক্স কুরিয়ার", en: "RedX Courier" },
  configSchema: redxConfigSchema,
  secretFields: ["apiToken"],
  async testConnection(config) {
    try {
      const response = await fetch(`${config.baseUrl}/areas`, { headers: headers(config) });
      if (!response.ok) return { ok: false, message: `RedX returned HTTP ${response.status}` };
      return { ok: true, message: "Connected to RedX." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
