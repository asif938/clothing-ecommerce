import { ForbiddenException } from "@nestjs/common";
import type { SettingsService } from "../settings/settings.service";

export type RewardsFeature = "storeCredit.enabled" | "giftCards.enabled" | "referral.enabled" | "affiliates.enabled";

/** §4.2 — when a feature toggle is off, its storefront endpoints answer `FEATURE_DISABLED`. Admin screens keep working so staff can set things up first. */
export async function assertFeatureEnabled(settings: SettingsService, key: RewardsFeature): Promise<void> {
  if (!(await settings.getValue<boolean>(key))) {
    throw new ForbiddenException({ code: "FEATURE_DISABLED", message: "This feature is turned off." });
  }
}
