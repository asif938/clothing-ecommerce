import type { ProviderCapability, ProviderDriverDefinition } from "./types.ts";
import { localStorageDriverDefinition } from "./drivers/storage-local.ts";
import { s3StorageDriverDefinition } from "./drivers/storage-s3.ts";
import { mockEmailDriverDefinition } from "./drivers/email-mock.ts";
import { smtpEmailDriverDefinition } from "./drivers/email-smtp.ts";
import { mockSmsDriverDefinition } from "./drivers/sms-mock.ts";

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
  mockEmailDriverDefinition as unknown as ProviderDriverDefinition,
  smtpEmailDriverDefinition as unknown as ProviderDriverDefinition,
  mockSmsDriverDefinition as unknown as ProviderDriverDefinition,
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
