import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

/** TOTP 2FA for staff login (§5.1 `staff_users.totp_secret`/`totp_enabled`, §16 M1). */

export function generateTotpSecret(): string {
  return generateSecret();
}

export async function verifyTotpToken(secret: string, token: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token });
    return result.valid;
  } catch {
    return false;
  }
}

/** `issuer` should be the brand name; `accountLabel` the staff user's email. */
export async function generateTotpSetup(
  secret: string,
  accountLabel: string,
  issuer: string,
): Promise<{ otpauthUrl: string; qrCodeDataUrl: string }> {
  const otpauthUrl = generateURI({ issuer, label: accountLabel, secret });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
  return { otpauthUrl, qrCodeDataUrl };
}
