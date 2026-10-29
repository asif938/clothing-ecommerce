/**
 * §6.9 doorstep rejection — pure refund math, unit-tested. Only concerns
 * money that was already *paid in advance* (`paidTotal`); COD amounts are
 * never "refunded" here because the courier simply never collects them in
 * the first place — nothing to undo.
 *
 * Step 3 (partial delivery, some items kept) and step 4 (full rejection,
 * nothing kept) reduce to the same formula: whatever was prepaid, minus
 * whatever the customer now owes for the rejection itself (the door charge,
 * per `returns.doorstepCustomerPays`), minus the value of any items they
 * did keep (0 for a full rejection).
 */
export interface DoorstepRejectionInput {
  paidTotal: number;
  doorCharge: number;
  keptItemsValue: number;
}

export function computeDoorstepRefundableAmount(input: DoorstepRejectionInput): number {
  return Math.max(0, input.paidTotal - input.doorCharge - input.keptItemsValue);
}

export type DoorstepCustomerPaysPolicy = "delivery_fee_only" | "delivery_fee_plus_return" | "free";

/** What the customer owes at the door, per the configured policy (§6.9 step 7). */
export function computeDoorCharge(policy: DoorstepCustomerPaysPolicy, deliveryFeeCollected: number, returnShippingFee: number): number {
  switch (policy) {
    case "free":
      return 0;
    case "delivery_fee_only":
      return deliveryFeeCollected;
    case "delivery_fee_plus_return":
      return deliveryFeeCollected + returnShippingFee;
  }
}
