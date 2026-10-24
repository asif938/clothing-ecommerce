/**
 * Risk scoring (docs/PROJECT_SPEC.md §6.6) — pure function, unit-tested.
 * Weights and thresholds are admin-editable settings (`risk.weights`,
 * `risk.thresholds`); this just applies whatever weights it's given so the
 * business logic stays testable independent of the settings registry.
 */

export interface RiskWeights {
  blocklisted_phone: number;
  courier_history_low: number;
  courier_history_medium: number;
  doorstep_rejection: number;
  cancelled_after_confirm: number;
  new_customer_high_value: number;
  same_phone_or_device_burst: number;
  same_ip_multi_phone_burst: number;
  address_too_short_or_test_words: number;
  name_looks_invalid: number;
  delivered_history_no_rejections: number;
  otp_verified: number;
}

export interface RiskInput {
  phoneBlocked: boolean;
  courierSuccessRatio: number | null;
  courierSampleSize: number;
  previousDoorstepRejections: number;
  previousCancelledAfterConfirm: number;
  isNewCustomer: boolean;
  orderTotal: number;
  highValueThreshold: number;
  samePhoneOrDeviceOrdersLast24h: number;
  sameIpDifferentPhonesLast24h: number;
  addressLooksInvalid: boolean;
  nameLooksInvalid: boolean;
  deliveredCount: number;
  rejectedAtDoorCount: number;
  otpVerified: boolean;
}

const MAX_REPEATS = 3;

export interface RiskScoreResult {
  score: number;
  reasonCodes: string[];
}

export function computeRiskScore(input: RiskInput, weights: RiskWeights): RiskScoreResult {
  let score = 0;
  const reasonCodes: string[] = [];

  const add = (points: number, code: string) => {
    if (points === 0) return;
    score += points;
    reasonCodes.push(code);
  };

  if (input.phoneBlocked) add(weights.blocklisted_phone, "blocklisted_phone");

  if (input.courierSuccessRatio !== null && input.courierSampleSize >= 3) {
    if (input.courierSuccessRatio < 0.5) add(weights.courier_history_low, "courier_history_low");
    else if (input.courierSuccessRatio < 0.75) add(weights.courier_history_medium, "courier_history_medium");
  }

  add(Math.min(input.previousDoorstepRejections, MAX_REPEATS) * weights.doorstep_rejection, "doorstep_rejection");
  add(Math.min(input.previousCancelledAfterConfirm, MAX_REPEATS) * weights.cancelled_after_confirm, "cancelled_after_confirm");

  if (input.isNewCustomer && input.orderTotal > input.highValueThreshold) add(weights.new_customer_high_value, "new_customer_high_value");
  if (input.samePhoneOrDeviceOrdersLast24h >= 3) add(weights.same_phone_or_device_burst, "same_phone_or_device_burst");
  if (input.sameIpDifferentPhonesLast24h >= 5) add(weights.same_ip_multi_phone_burst, "same_ip_multi_phone_burst");
  if (input.addressLooksInvalid) add(weights.address_too_short_or_test_words, "address_too_short_or_test_words");
  if (input.nameLooksInvalid) add(weights.name_looks_invalid, "name_looks_invalid");
  if (input.deliveredCount >= 3 && input.rejectedAtDoorCount === 0) add(weights.delivered_history_no_rejections, "delivered_history_no_rejections");
  if (input.otpVerified) add(weights.otp_verified, "otp_verified");

  return { score: Math.max(0, score), reasonCodes };
}

export type RiskLevel = "low" | "medium" | "high";

export function riskLevelFor(score: number, thresholds: { low: number; medium: number }): RiskLevel {
  if (score < thresholds.low) return "low";
  if (score < thresholds.medium) return "medium";
  return "high";
}

const TEST_WORDS = ["test", "asdf", "xxxx", "qwerty"];

export function addressLooksInvalid(addressLine: string): boolean {
  const normalized = addressLine.trim().toLowerCase();
  if (normalized.length < 8) return true;
  return TEST_WORDS.some((word) => normalized.includes(word));
}

export function nameLooksInvalid(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 3) return true;
  if (/^\d+$/.test(trimmed)) return true;
  // Flags "aaaaaa"/"xxxxxx"-style repeated-character names without over-matching real names with doubled letters (e.g. "Hassan").
  if (/^(.)\1{2,}$/.test(trimmed.replace(/\s/g, ""))) return true;
  return false;
}
