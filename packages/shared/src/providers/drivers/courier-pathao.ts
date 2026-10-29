import { z } from "zod";
import type { CourierDriver, CourierStatusResult, ProviderDriverDefinition, ShipmentStatusValue } from "../types.ts";

/**
 * Pathao Courier Merchant API (docs/PROJECT_SPEC.md §10.2). Implemented
 * against Pathao's documented `aladdin` API (OAuth password grant → store/
 * city/zone/area lookups → create order → status). Not verified against a
 * live sandbox account in this environment (§10 — see docs/DECISIONS.md).
 * Re-verify endpoint paths and field names against Pathao's current merchant
 * docs before going live.
 *
 * Token caching is not implemented — each call grants a fresh access token,
 * same trade-off already accepted for bKash in M5 (see payment-bkash.ts):
 * correct, just not the most efficient under real traffic.
 */
export const pathaoConfigSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  storeId: z.string().min(1),
  sandbox: z.boolean().default(true),
});
export type PathaoConfig = z.infer<typeof pathaoConfigSchema>;

function baseUrl(config: PathaoConfig): string {
  return config.sandbox ? "https://courier-api-sandbox.pathao.com" : "https://api-hermes.pathao.com";
}

async function grantToken(config: PathaoConfig): Promise<string> {
  const response = await fetch(`${baseUrl(config)}/aladdin/api/v1/issue-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      username: config.username,
      password: config.password,
      grant_type: "password",
    }),
  });
  const data = (await response.json()) as { access_token?: string; message?: string };
  if (!data.access_token) throw new Error(data.message ?? "Pathao token grant failed");
  return data.access_token;
}

function authHeaders(token: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export const pathaoStatusMap: Record<string, ShipmentStatusValue> = {
  Pending: "booked",
  "Pickup Requested": "booked",
  "Assigned for Pickup": "booked",
  Picked: "picked_up",
  "At the Sorting HUB": "in_transit",
  "In Transit": "in_transit",
  "Received at Last Mile Hub": "in_transit",
  "Assigned for Delivery": "out_for_delivery",
  Delivered: "delivered",
  Partial_Delivery: "partially_delivered",
  Return: "returned_to_sender",
  "Delivery Failed": "returned_to_sender",
  Cancelled: "cancelled",
};

export function createPathaoDriver(config: PathaoConfig): CourierDriver {
  return {
    async createParcel(input) {
      const token = await grantToken(config);
      if (!input.areaCode) throw new Error("No Pathao area mapping configured for this destination (see Courier area mapping in admin).");
      const [cityId, zoneId, areaId] = input.areaCode.split(":");
      const response = await fetch(`${baseUrl(config)}/aladdin/api/v1/orders`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          store_id: config.storeId,
          merchant_order_id: input.reference,
          recipient_name: input.recipientName,
          recipient_phone: input.recipientPhone,
          recipient_address: input.recipientAddress,
          recipient_city: cityId,
          recipient_zone: zoneId,
          recipient_area: areaId,
          delivery_type: 48,
          item_type: 2,
          special_instruction: input.note ?? "",
          item_quantity: input.quantity,
          item_weight: Math.max(0.5, input.weightGrams / 1000),
          item_description: input.itemDescription,
          amount_to_collect: Math.round(input.codAmount / 100),
        }),
      });
      const body = (await response.json()) as { data?: { consignment_id: string; order_status: string }; message?: string };
      if (!response.ok || !body.data) throw new Error(body.message ?? `Pathao order creation failed (HTTP ${response.status})`);
      return { consignmentId: body.data.consignment_id, trackingCode: body.data.consignment_id, raw: body };
    },
    async getStatus(consignmentId): Promise<CourierStatusResult> {
      const token = await grantToken(config);
      const response = await fetch(`${baseUrl(config)}/aladdin/api/v1/orders/${consignmentId}/info`, { headers: authHeaders(token) });
      const body = (await response.json()) as { data?: { order_status?: string }; message?: string };
      const rawStatus = body.data?.order_status ?? "unknown";
      return { status: pathaoStatusMap[rawStatus] ?? "booked", rawStatus, raw: body };
    },
  };
}

export const pathaoDriverDefinition: ProviderDriverDefinition<PathaoConfig> = {
  capability: "courier",
  driver: "pathao",
  label: { bn: "পাঠাও কুরিয়ার", en: "Pathao Courier" },
  configSchema: pathaoConfigSchema,
  secretFields: ["clientSecret", "password"],
  async testConnection(config) {
    try {
      await grantToken(config);
      return { ok: true, message: "Connected to Pathao (token granted)." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
