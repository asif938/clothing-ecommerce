import { HttpException, HttpStatus } from "@nestjs/common";
import type { CacheService } from "../cache/cache.service";
import type { SettingsService } from "../settings/settings.service";

/**
 * Per-visitor hourly cap on gift card code lookups (balance check, apply at
 * checkout, add to wallet), so codes can't be guessed by brute force. In
 * process memory like M15's live-chat limiter — per instance, which is the
 * free-tier single-instance deployment (docs/DECISIONS.md).
 */
export async function takeGiftCardCheckToken(cache: CacheService, settings: SettingsService, visitorKey: string): Promise<void> {
  const limit = await settings.getValue<number>("giftCards.checksPerHour");
  const key = `giftcard:checks:${visitorKey}`;
  const now = Date.now();
  const entry = cache.get<{ count: number; resetAt: number }>(key) ?? { count: 0, resetAt: now + 3_600_000 };
  if (entry.count >= limit) throw new HttpException({ code: "GIFT_CARD_RATE_LIMITED", message: "Too many gift card attempts — please try again later." }, HttpStatus.TOO_MANY_REQUESTS);
  entry.count += 1;
  cache.set(key, entry, { ttlSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) });
}
