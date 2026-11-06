import { z } from "zod";
import type { CourierDriver, CourierStatusResult, ProviderDriverDefinition, ShipmentStatusValue } from "../types.ts";

/**
 * Steadfast Courier Ltd (docs/PROJECT_SPEC.md §10.2). Implemented against
 * Steadfast's documented REST API (`Api-Key`/`Secret-Key` headers,
 * `POST /create_order`, `GET /status_by_cid/:id`); not verified against a
 * live sandbox account in this environment (§10: "no merchant accounts
 * exist yet" — see docs/DECISIONS.md). Re-verify endpoint paths and field
 * names against Steadfast's current docs before going live.
 */
export const steadfastConfigSchema = z.object({
  apiKey: z.string().min(1),
  secretKey: z.string().min(1),
  baseUrl: z.string().url().default("https://portal.packzy.com/api/v1"),
  /** §12 "webhook signature verification" — shared-secret header (`X-Webhook-Secret`), see courier-pathao.ts for why. */
  webhookSecret: z.string().optional(),
});
export type SteadfastConfig = z.infer<typeof steadfastConfigSchema>;

export const steadfastStatusMap: Record<string, ShipmentStatusValue> = {
  pending: "booked",
  delivered_approval_pending: "out_for_delivery",
  delivered: "delivered",
  partial_delivered: "partially_delivered",
  cancelled: "returned_to_sender",
  hold: "in_transit",
  in_review: "in_transit",
  unknown: "booked",
};

function headers(config: SteadfastConfig) {
  return { "Api-Key": config.apiKey, "Secret-Key": config.secretKey, "Content-Type": "application/json" };
}

export function createSteadfastDriver(config: SteadfastConfig): CourierDriver {
  return {
    async createParcel(input) {
      const response = await fetch(`${config.baseUrl}/create_order`, {
        method: "POST",
        headers: headers(config),
        body: JSON.stringify({
          invoice: input.reference,
          recipient_name: input.recipientName,
          recipient_phone: input.recipientPhone,
          recipient_address: input.recipientAddress,
          cod_amount: Math.round(input.codAmount / 100),
          note: input.note ?? "",
          item_description: input.itemDescription,
          total_lot: input.quantity,
        }),
      });
      const body = (await response.json()) as { consignment?: { consignment_id: number; tracking_code: string }; message?: string };
      if (!response.ok || !body.consignment) {
        throw new Error(body.message ?? `Steadfast create_order failed (HTTP ${response.status})`);
      }
      return {
        consignmentId: String(body.consignment.consignment_id),
        trackingCode: body.consignment.tracking_code,
        trackingUrl: `https://steadfast.com.bd/t/${body.consignment.tracking_code}`,
        raw: body,
      };
    },
    async getStatus(consignmentId): Promise<CourierStatusResult> {
      const response = await fetch(`${config.baseUrl}/status_by_cid/${consignmentId}`, { headers: headers(config) });
      const body = (await response.json()) as { delivery_status?: string; message?: string };
      const rawStatus = body.delivery_status ?? "unknown";
      return { status: steadfastStatusMap[rawStatus] ?? "booked", rawStatus, raw: body };
    },
  };
}

export const steadfastDriverDefinition: ProviderDriverDefinition<SteadfastConfig> = {
  capability: "courier",
  driver: "steadfast",
  label: { bn: "স্টেডফাস্ট কুরিয়ার", en: "Steadfast Courier" },
  configSchema: steadfastConfigSchema,
  secretFields: ["secretKey"],
  async testConnection(config) {
    try {
      const response = await fetch(`${config.baseUrl}/get_balance`, { headers: headers(config) });
      if (!response.ok) return { ok: false, message: `Steadfast returned HTTP ${response.status}` };
      const body = (await response.json()) as { current_balance?: number };
      return { ok: true, message: "Connected to Steadfast.", details: { balance: body.current_balance } };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
