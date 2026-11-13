import { z } from "zod";

/** Mirrors the Prisma `OrderStatus` enum for query validation on the public API. */
export const OrderStatusSchema = z.enum([
  "pending_payment",
  "pending",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "partially_delivered",
  "rejected_at_door",
  "returned_to_sender",
  "returned_to_warehouse",
  "completed",
  "on_hold",
  "cancelled",
  "expired",
]);
