import { z } from "zod";

export const bookShipmentSchema = z.object({
  // null = the built-in "manual" option (§10.2) — staff enters the courier name/tracking code directly.
  courierProviderInstanceId: z.string().nullable(),
  // §16 M11 - when true the courier is chosen by the auto-assignment rules and `courierProviderInstanceId` is ignored.
  auto: z.boolean().default(false),
  manualCourierName: z.string().min(1).max(120).nullable().default(null),
  manualTrackingCode: z.string().min(1).max(120).nullable().default(null),
});
export type BookShipmentDto = z.infer<typeof bookShipmentSchema>;

export const updateShipmentStatusSchema = z.object({
  status: z.enum(["booked", "picked_up", "in_transit", "out_for_delivery", "delivered", "partially_delivered", "rejected_at_door", "returned_to_sender", "cancelled", "lost"]),
  deliveryFeeCollected: z.number().int().min(0).nullable().optional(),
  deliveryChargeActual: z.number().int().min(0).nullable().optional(),
  message: z.string().nullable().optional(),
});
export type UpdateShipmentStatusDto = z.infer<typeof updateShipmentStatusSchema>;

export const reconcilePartialDeliverySchema = z.object({
  items: z.array(z.object({ orderItemId: z.string().min(1), keptQty: z.number().int().min(0) })).min(1),
});
export type ReconcilePartialDeliveryDto = z.infer<typeof reconcilePartialDeliverySchema>;

export const receiveAtWarehouseSchema = z.object({
  items: z.array(z.object({ orderItemId: z.string().min(1), restock: z.boolean() })).min(1),
});
export type ReceiveAtWarehouseDto = z.infer<typeof receiveAtWarehouseSchema>;
