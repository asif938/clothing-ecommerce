import { SetMetadata } from "@nestjs/common";

export const SKIP_TOTP_ENFORCEMENT_METADATA_KEY = "skipTotpEnforcement";

/**
 * §12 "mandatory TOTP 2FA for all staff" — StaffAuthGuard blocks every
 * route for a staff user who hasn't enabled TOTP yet, except the handful
 * marked with this decorator (so they can actually get through the setup
 * flow: see the two `totp/*` routes, plus `me`/`logout` so the admin UI
 * can show who's logged in and let them leave).
 */
export const SkipTotpEnforcement = () => SetMetadata(SKIP_TOTP_ENFORCEMENT_METADATA_KEY, true);
