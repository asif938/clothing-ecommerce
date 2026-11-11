import type { AuthenticatedStaff } from "./types";

const MASK_CHAR = "•";

/** "01712345678" → "01712•••678". Short/odd values are fully masked rather than leaked. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return phone ?? null;
  if (phone.length < 8) return MASK_CHAR.repeat(phone.length);
  return `${phone.slice(0, 5)}${MASK_CHAR.repeat(phone.length - 8)}${phone.slice(-3)}`;
}

export interface FieldAccess {
  phone: boolean;
  cost: boolean;
}

/** Field-level permissions (§16 M11): when enforcement is off every field is visible, preserving pre-M11 behaviour. */
export function fieldAccessFor(staff: Pick<AuthenticatedStaff, "permissions"> | undefined, enforced: boolean): FieldAccess {
  if (!enforced || !staff) return { phone: true, cost: true };
  return { phone: staff.permissions.has("fields.customer_phone.read"), cost: staff.permissions.has("fields.order_cost.read") || staff.permissions.has("catalog.cost.read") };
}

type Json = Record<string, unknown> | null;

/** Masks phones inside an order-shaped object (billing contact, shipping address, joined customer) and strips line cost prices, without mutating the input. */
export function applyOrderFieldAccess<T extends { billingContact?: unknown; shippingAddress?: unknown; customer?: { phone?: string | null } | null; items?: unknown }>(order: T, access: FieldAccess): T {
  if (access.phone && access.cost) return order;
  const copy: Record<string, unknown> = { ...order };
  if (!access.phone) {
    for (const key of ["billingContact", "shippingAddress"] as const) {
      const value = copy[key] as Json | undefined;
      if (value && typeof value === "object" && "phone" in value) copy[key] = { ...value, phone: maskPhone(value.phone as string | null) };
    }
    const customer = copy.customer as { phone?: string | null } | null | undefined;
    if (customer && "phone" in customer) copy.customer = { ...customer, phone: maskPhone(customer.phone) };
  }
  if (!access.cost && Array.isArray(copy.items)) {
    copy.items = (copy.items as Record<string, unknown>[]).map((item) => ("costPrice" in item ? { ...item, costPrice: null } : item));
  }
  return copy as T;
}
