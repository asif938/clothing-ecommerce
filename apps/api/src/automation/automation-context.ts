import type { ConditionContext } from "@clothing/shared/automation";

export interface AutomationOrderInput {
  status: string;
  paymentStatus: string;
  channel: string;
  riskLevel: string;
  riskScore: number;
  total: number;
  codAmount: number;
  paidTotal: number;
  totalWeightGrams: number;
  tags: string[];
  possibleDuplicateOrderIds: string[];
  shippingAddress: { divisionId?: string; districtId?: string } | null;
  itemCount: number;
}

export interface AutomationCustomerInput {
  orderCount: number;
  rejectedAtDoorCount: number;
  tags: string[];
}

/** Flattens an order (+ its customer) into the field map `evaluateConditions` reads — pure, so the "test with sample event" path and the live path agree. */
export function buildAutomationContext(order: AutomationOrderInput, customer: AutomationCustomerInput | null, isDhakaCity: boolean): ConditionContext {
  return {
    "order.total": order.total,
    "order.codAmount": order.codAmount,
    "order.itemCount": order.itemCount,
    "order.status": order.status,
    "order.paymentStatus": order.paymentStatus,
    "order.channel": order.channel,
    "order.riskLevel": order.riskLevel,
    "order.riskScore": order.riskScore,
    "order.tags": order.tags,
    "order.isPrepaid": order.paidTotal > 0,
    "order.hasDuplicate": order.possibleDuplicateOrderIds.length > 0,
    "order.divisionId": order.shippingAddress?.divisionId ?? null,
    "order.districtId": order.shippingAddress?.districtId ?? null,
    "order.isDhakaCity": isDhakaCity,
    "order.weightGrams": order.totalWeightGrams,
    "customer.orderCount": customer?.orderCount ?? 0,
    "customer.isFirstOrder": (customer?.orderCount ?? 0) <= 1,
    "customer.rejectedAtDoorCount": customer?.rejectedAtDoorCount ?? 0,
    "customer.tags": customer?.tags ?? [],
  };
}
