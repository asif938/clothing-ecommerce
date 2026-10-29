import type { ProviderCapability, ProviderDriverDefinition } from "./types.ts";
import { localStorageDriverDefinition } from "./drivers/storage-local.ts";
import { s3StorageDriverDefinition } from "./drivers/storage-s3.ts";
import { cloudinaryStorageDriverDefinition } from "./drivers/storage-cloudinary.ts";
import { mockEmailDriverDefinition } from "./drivers/email-mock.ts";
import { smtpEmailDriverDefinition } from "./drivers/email-smtp.ts";
import { mockSmsDriverDefinition } from "./drivers/sms-mock.ts";
import { mockPaymentDriverDefinition } from "./drivers/payment-mock.ts";
import { sslcommerzDriverDefinition } from "./drivers/payment-sslcommerz.ts";
import { bkashDriverDefinition } from "./drivers/payment-bkash.ts";
import { nagadDriverDefinition } from "./drivers/payment-nagad.ts";
import { turnstileDriverDefinition } from "./drivers/captcha-turnstile.ts";
import { mockCaptchaDriverDefinition } from "./drivers/captcha-mock.ts";
import { mockFraudCheckDriverDefinition } from "./drivers/fraud-check-mock.ts";
import { mockCourierDriverDefinition } from "./drivers/courier-mock.ts";
import { steadfastDriverDefinition } from "./drivers/courier-steadfast.ts";
import { pathaoDriverDefinition } from "./drivers/courier-pathao.ts";
import { redxDriverDefinition } from "./drivers/courier-redx.ts";

/**
 * The static catalog of every driver implemented so far, keyed by
 * `capability:driver`. `apps/api`'s ProviderRegistry resolves configured
 * `provider_instances` rows against this catalog. Grows as each milestone
 * adds drivers for its capability (payment, courier, …) — see types.ts.
 */
// Each driver's config type differs, but they share one array keyed by
// capability+driver string, not by generic type — the cast through
// `unknown` is this module's one integration boundary (golden rule 9).
// `getDriverDefinition`/callers re-validate with the driver's own
// `configSchema` before trusting the shape, so nothing unsound escapes it.
export const PROVIDER_DRIVER_CATALOG: ProviderDriverDefinition[] = [
  localStorageDriverDefinition as unknown as ProviderDriverDefinition,
  s3StorageDriverDefinition as unknown as ProviderDriverDefinition,
  cloudinaryStorageDriverDefinition as unknown as ProviderDriverDefinition,
  mockEmailDriverDefinition as unknown as ProviderDriverDefinition,
  smtpEmailDriverDefinition as unknown as ProviderDriverDefinition,
  mockSmsDriverDefinition as unknown as ProviderDriverDefinition,
  mockPaymentDriverDefinition as unknown as ProviderDriverDefinition,
  sslcommerzDriverDefinition as unknown as ProviderDriverDefinition,
  bkashDriverDefinition as unknown as ProviderDriverDefinition,
  nagadDriverDefinition as unknown as ProviderDriverDefinition,
  turnstileDriverDefinition as unknown as ProviderDriverDefinition,
  mockCaptchaDriverDefinition as unknown as ProviderDriverDefinition,
  mockFraudCheckDriverDefinition as unknown as ProviderDriverDefinition,
  mockCourierDriverDefinition as unknown as ProviderDriverDefinition,
  steadfastDriverDefinition as unknown as ProviderDriverDefinition,
  pathaoDriverDefinition as unknown as ProviderDriverDefinition,
  redxDriverDefinition as unknown as ProviderDriverDefinition,
];

export function getDriverDefinition(
  capability: ProviderCapability,
  driver: string,
): ProviderDriverDefinition | undefined {
  return PROVIDER_DRIVER_CATALOG.find((d) => d.capability === capability && d.driver === driver);
}

export function listDriverDefinitions(capability: ProviderCapability): ProviderDriverDefinition[] {
  return PROVIDER_DRIVER_CATALOG.filter((d) => d.capability === capability);
}
