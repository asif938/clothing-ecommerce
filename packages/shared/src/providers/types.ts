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
  // §16 M13 — customer-list upload to ad platforms (Meta Custom Audiences, Google Customer Match).
  "audience",
  // §16 M15 — support inbox channels besides WhatsApp (Messenger, Instagram) and click-to-call.
  "chat_channel",
  "telephony",
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
 * WhatsApp Cloud API notes (docs/PROJECT_SPEC.md §10.3, §16 M7): Meta only
 * lets a business send free-form text within a 24h customer-initiated
 * session window; outside it, a *business-initiated* message (every
 * transactional notification this capability sends) must use a pre-approved
 * message template, not arbitrary text — our `send()` still takes plain
 * text for a uniform interface across drivers, and the real Cloud API
 * driver sends it as a `text` message, which Meta will reject outside an
 * open session. Modeling real template-name/parameter mapping is deferred
 * (see docs/DECISIONS.md) — `click_to_chat` (M3, a link builder, not a
 * capability driver) remains unaffected since it never sends anything
 * itself.
 */
export interface WhatsappDriver {
  send(to: string, text: string): Promise<void>;
  /** §16 M15 inbox: a session (customer-initiated, 24 h window) reply that reports the provider's message id. */
  sendSession?(to: string, text: string): Promise<{ externalMessageId: string | null }>;
  /** §16 M15 inbox: inbound messages and delivery statuses from the provider's webhook payload. */
  parseWebhook?(payload: unknown): InboxEvent[];
}

/**
 * Support inbox events (docs/PROJECT_SPEC.md §5.10 `conversations`, §16
 * M15), normalised across WhatsApp Cloud, Messenger, Instagram and the mock.
 * `contactId` is the channel's own id for the customer (WhatsApp number,
 * Messenger PSID, Instagram-scoped id).
 */
export interface InboundChatMessage {
  kind: "message";
  contactId: string;
  externalMessageId: string;
  contactName?: string | null;
  /** E.164 when the channel exposes it (WhatsApp). */
  phone?: string | null;
  text: string;
  attachments: { type: "image" | "video" | "audio" | "file" | "location" | "sticker" | "other"; url?: string | null; caption?: string | null }[];
  timestamp: Date;
}

export interface ChatStatusUpdate {
  kind: "status";
  externalMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  error?: string | null;
}

export type InboxEvent = InboundChatMessage | ChatStatusUpdate;

/** Messenger / Instagram (and their mock). Replies only — these platforms only let a business answer a customer who wrote first. */
export interface ChatChannelDriver {
  channel: "messenger" | "instagram";
  sendText(contactId: string, text: string): Promise<{ externalMessageId: string | null }>;
  parseWebhook(payload: unknown): InboxEvent[];
}

/**
 * Click-to-call (docs/PROJECT_SPEC.md §8.2 call-centre tools, §16 M15
 * "click-to-call telephony integration (generic provider)"): the provider
 * rings the agent's phone, then bridges to the customer.
 */
export interface TelephonyCallRequest {
  agentNumber: string;
  customerNumber: string;
  /** Our call-log id, echoed back by providers that support a reference. */
  reference: string;
}

export interface TelephonyCallUpdate {
  externalId: string | null;
  reference: string | null;
  status: "initiated" | "ringing" | "answered" | "completed" | "no_answer" | "busy" | "failed";
  durationSeconds?: number | null;
  recordingUrl?: string | null;
}

export interface TelephonyDriver {
  startCall(request: TelephonyCallRequest): Promise<{ externalId: string | null }>;
  parseWebhook(payload: unknown): TelephonyCallUpdate | null;
}

/**
 * Server-side tracking/conversions-API drivers (docs/PROJECT_SPEC.md §10.5,
 * §13.3) — Meta Conversions API, GA4 Measurement Protocol, TikTok Events
 * API. `eventId` is the same id the client pixel call used for the same
 * event (shared for platform-side deduplication, per spec); `userData` is
 * raw (unhashed) here — each driver hashes whatever its own API requires at
 * the request boundary, not the caller.
 */
export interface TrackingEventInput {
  eventName: string;
  eventId: string;
  eventTimeUnixSeconds: number;
  /** Order/cart total in taka (not poisha) — these APIs all want a plain currency amount. */
  value?: number;
  currency?: string;
  contents?: { id: string; quantity: number; price?: number }[];
  userData: { phone?: string; email?: string; clientIp?: string; userAgent?: string; fbc?: string; fbp?: string };
  sourceUrl?: string;
}

export interface TrackingDriver {
  send(event: TrackingEventInput): Promise<void>;
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

/**
 * Courier drivers (docs/PROJECT_SPEC.md §10.2) — Steadfast/Pathao/RedX each
 * have a different real API (and different area/zone lookup needs — see
 * `CourierAreaMapping`) but all funnel down to the same three operations
 * from `ShipmentsService`'s point of view: book a parcel, poll its status,
 * optionally cancel it. Money fields are poisha (golden rule 3); drivers
 * convert to the provider's own unit (usually whole taka) at the boundary.
 */
export type ShipmentStatusValue =
  | "pending"
  | "booked"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "partially_delivered"
  | "returned_to_sender"
  | "rejected_at_door"
  | "cancelled"
  | "lost";

export interface CourierParcelInput {
  /** Our order number — used as the provider's invoice/merchant-reference field. */
  reference: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  /** From `CourierAreaMapping`, when the driver needs it (Pathao city/zone/area, RedX area id) — null when no mapping exists yet for this destination. */
  areaCode: string | null;
  areaName: string | null;
  codAmount: number;
  weightGrams: number;
  itemDescription: string;
  quantity: number;
  note?: string;
}

export interface CourierParcelResult {
  consignmentId: string;
  trackingCode: string;
  trackingUrl?: string;
  raw?: unknown;
}

export interface CourierStatusResult {
  status: ShipmentStatusValue;
  rawStatus: string;
  /** §6.9 — delivery charge the courier collected from the customer at the door on a rejection/partial delivery, when the provider reports it. */
  deliveryFeeCollected?: number;
  /** §10.2 "delivery_charge_actual (courier cost)" — what the courier bills us, when known at this point. */
  deliveryChargeActual?: number;
  message?: string;
  raw?: unknown;
}

/** A parcel we're asking the courier about when fetching COD settlement data (§16 M12). */
export interface CourierSettlementQuery {
  consignmentId: string;
  /** Our expected COD amount (poisha) — only some providers need it, e.g. the mock. */
  expectedCod: number;
}

/** One parcel's money as the courier reports it (poisha). Only parcels the courier has actually paid out are returned. */
export interface CourierSettlementLine {
  consignmentId: string;
  collected: number;
  charge: number;
  settlementRef?: string;
  raw?: unknown;
}

export interface CourierDriver {
  createParcel(input: CourierParcelInput): Promise<CourierParcelResult>;
  getStatus(consignmentId: string): Promise<CourierStatusResult>;
  /** Not every provider supports cancelling a booked parcel through the API — optional. */
  cancelParcel?(consignmentId: string): Promise<void>;
  /**
   * §10.2 `getCodSettlement?` / §16 M12 "COD reconciliation (file import +
   * API where available)". Optional: providers with no documented payout
   * API leave it out and staff import the courier's settlement file instead.
   */
  getCodSettlement?(parcels: CourierSettlementQuery[]): Promise<CourierSettlementLine[]>;
}

/**
 * AI text generation (docs/PROJECT_SPEC.md §10.4, §16 M13). One call, one
 * reply: the API owns prompts, budgets, usage logging and parsing; a driver
 * only talks to its vendor and reports token usage for cost estimates.
 */
export interface AiImageInput {
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  base64: string;
}

export interface AiGenerateInput {
  model: string;
  system: string;
  prompt: string;
  images?: AiImageInput[];
  maxTokens: number;
  /** Ignored by drivers whose models reject sampling parameters (current Claude models). */
  temperature?: number | null;
  /** Reasoning effort for drivers that support it (Anthropic `output_config.effort`). */
  effort?: "low" | "medium" | "high" | null;
}

export interface AiGenerateResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Tool-using chat (docs/PROJECT_SPEC.md §10.4 "chat assistant … via tool
 * calls to our API", §16 M15). A vendor-neutral transcript: the API runs
 * the loop and executes tools itself; a driver translates one turn to its
 * vendor's format and back.
 */
export interface AiToolDefinition {
  name: string;
  description: string;
  /** JSON Schema of the tool input (an object schema). */
  inputSchema: Record<string, unknown>;
}

export interface AiToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /**
   * Opaque token some providers attach to a tool call and require back,
   * unchanged, with the next request (Gemini's `thoughtSignature`). Other
   * drivers ignore it.
   */
  signature?: string;
}

export type AiChatMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls?: AiToolCall[] }
  | { role: "tool"; results: { toolCallId: string; name: string; content: string; isError?: boolean }[] };

export interface AiChatInput {
  model: string;
  system: string;
  messages: AiChatMessage[];
  tools: AiToolDefinition[];
  maxTokens: number;
  temperature?: number | null;
  effort?: "low" | "medium" | "high" | null;
}

export interface AiChatResult {
  text: string;
  toolCalls: AiToolCall[];
  stopReason: "end" | "tool_use" | "max_tokens";
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiDriver {
  generate(input: AiGenerateInput): Promise<AiGenerateResult>;
  /** Optional: drivers without tool use can't run the chat assistant (the API falls through to the next provider). */
  chat?(input: AiChatInput): Promise<AiChatResult>;
}

/** Per-instance pricing used for budget estimates — US cents per million tokens (integers, like every other money value). */
export interface AiPricingConfig {
  inputCentsPerMTok: number;
  outputCentsPerMTok: number;
}

/**
 * Ad-platform audience upload (docs/PROJECT_SPEC.md §8.2 Customers "audience
 * sync to Meta/Google", §16 M13). Drivers hash identifiers themselves
 * (SHA-256 of normalized phone digits / lowercased email), same rule as the
 * tracking drivers: callers pass raw values.
 */
export interface AudienceMember {
  /** E.164, e.g. +8801712345678. */
  phone?: string | null;
  email?: string | null;
}

export interface AudienceDriver {
  /** Returns the platform's audience id, creating the audience when `existingId` is null. */
  ensureAudience(name: string, existingId: string | null): Promise<string>;
  addMembers(audienceId: string, members: AudienceMember[]): Promise<{ received: number }>;
}
