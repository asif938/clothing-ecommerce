import type { z } from "zod";
import type { LocalizedText } from "../i18n/localized-text.ts";

/**
 * Every capability a provider can back (docs/PROJECT_SPEC.md §4.3 table).
 * `provider_instances.capability` stores one of these. Only `storage`,
 * `email` and `sms` have concrete driver implementations in Milestone 1
 * (storage because the media library needs it; email/sms as the minimal
 * pair that proves the provider-framework + Integrations-UI + test-connection
 * pattern end-to-end with a `mock` driver). The rest are typed here so
 * `provider_instances` and the Integrations UI are capability-agnostic from
 * day one; their driver implementations land with the milestone that needs
 * them (payment/courier M5-M6, whatsapp/sms gateways M7, ai M10+, search M2,
 * captcha M5, fraud_check M5, tracking M8) — see docs/DECISIONS.md.
 * Milestone 5 adds `payment` (mock/SSLCommerz/bKash/Nagad — COD needs no
 * driver, it's built-in per §10.1), `captcha` (Turnstile + mock) and a
 * `fraud_check` mock (the "courier history" risk signal, §6.6 — no real BD
 * courier-history API integration exists yet, see docs/DECISIONS.md).
 */
export const PROVIDER_CAPABILITIES = [
  "payment",
  "courier",
  "sms",
  "email",
  "whatsapp",
  "ai",
  "storage",
  "search",
  "captcha",
  "fraud_check",
  "tracking",
] as const;
export type ProviderCapability = (typeof PROVIDER_CAPABILITIES)[number];

export interface ProviderTestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * A provider's self-reported consumption against whatever quota it has
 * (Cloudinary's shared storage/bandwidth/transformation credits, a courier's
 * monthly request cap, …). `usedPercent` is 0-100; `details` is
 * driver-specific and shown as-is on the admin System Health panel.
 */
export interface ProviderUsageResult {
  usedPercent: number;
  details?: Record<string, unknown>;
}

/**
 * Static catalog entry for one driver of one capability — config schema,
 * which fields are secrets, and how to test a configured instance. This is
 * framework-agnostic (no DB/Nest dependency); `apps/api`'s ProviderRegistry
 * service resolves instances from the database against this catalog.
 */
export interface ProviderDriverDefinition<TConfig = Record<string, unknown>> {
  capability: ProviderCapability;
  driver: string;
  label: LocalizedText;
  configSchema: z.ZodType<TConfig>;
  secretFields: string[];
  testConnection: (config: TConfig) => Promise<ProviderTestResult>;
  /** Optional: only drivers with a real usage/quota API implement this (e.g. Cloudinary credits). */
  usage?: (config: TConfig) => Promise<ProviderUsageResult>;
}

// ---------------------------------------------------------------------------
// Capability method contracts (golden rule 2: every integration is a
// provider behind an interface). Added as each capability gets a real driver.
// ---------------------------------------------------------------------------

export interface StorageDriver {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
  publicUrl(key: string): string;
  /** Optional: a presigned PUT URL for direct browser→bucket uploads. Only the s3 driver implements it — local has no such concept. */
  signedPutUrl?(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailDriver {
  send(message: EmailMessage): Promise<void>;
}

export interface SmsSendOptions {
  unicode?: boolean;
}

export interface SmsDriver {
  send(to: string, text: string, options?: SmsSendOptions): Promise<void>;
  balance?(): Promise<number>;
}

/**
 * Online payment drivers (docs/PROJECT_SPEC.md §10.1) — SSLCommerz, bKash
 * and Nagad each have a different real flow (session+IPN,
 * grant-token+execute, initialize+complete) but all funnel down to the
 * same two steps from the caller's point of view: start a hosted-page
 * payment and get a redirect URL back, then confirm what happened (from a
 * callback payload, or by actively querying the provider). COD needs
 * neither — it's handled directly in `PaymentsService`, never through this
 * interface (§10.1: "No gateway").
 */
export interface PaymentInitiateInput {
  amount: number;
  currency: string;
  orderNumber: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  returnUrls: { success: string; fail: string; cancel: string };
}

export interface PaymentInitiateResult {
  redirectUrl: string;
  externalRef: string;
  raw?: unknown;
}

export type PaymentVerificationStatus = "succeeded" | "failed" | "pending";

export interface PaymentVerifyResult {
  status: PaymentVerificationStatus;
  externalRef: string;
  amount?: number;
  raw?: unknown;
}

export interface PaymentDriver {
  initiate(input: PaymentInitiateInput): Promise<PaymentInitiateResult>;
  /** Called from the provider's callback/IPN/redirect, or by the reconciliation job re-querying a `pending` payment — must be idempotent (§10.1: "idempotent processing of duplicate callbacks"). */
  verify(externalRef: string, callbackPayload?: Record<string, unknown>): Promise<PaymentVerifyResult>;
}

/** Cloudflare Turnstile (or any future captcha), invisible on checkout/OTP/review/contact (§10.6). */
export interface CaptchaDriver {
  verify(token: string, remoteIp?: string): Promise<{ success: boolean; reason?: string }>;
}

/** The one risk-scoring signal (§6.6) that needs an external lookup; a real BD courier-history API is not integrated yet — see docs/DECISIONS.md. */
export interface FraudCheckDriver {
  checkPhone(phone: string): Promise<{ deliverySuccessRatio: number | null; sampleSize: number }>;
}
