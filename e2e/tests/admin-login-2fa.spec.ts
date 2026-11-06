import { createHmac } from "node:crypto";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ADMIN_URL = process.env.ADMIN_URL || "http://localhost:3001";

/**
 * §14 E2E "Admin: login with 2FA" + §12/§16 M9 "mandatory TOTP 2FA for all
 * staff" (StaffAuthGuard locks every route out until TOTP is enabled, see
 * apps/api/src/auth/staff-auth.guard.ts). Drives the real first-run setup
 * wizard end to end — no DB seeding needed for this one, since
 * `/setup` is only reachable while no Super Admin has confirmed 2FA yet
 * (SetupService.status()), so this must run against a *fresh* database.
 *
 * The setup page only ever shows the TOTP secret as a QR code image, not
 * as text — this computes the real 6-digit code from the `otpauthUrl` in
 * the API response instead of trying to read a QR code, same "intercept
 * the network response" technique as the guest-checkout spec.
 */
function base32Decode(base32: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totpCode(secretBase32: string, time = Date.now()): string {
  const counter = Math.floor(time / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(counter, 4);
  const hmac = createHmac("sha1", base32Decode(secretBase32)).update(counterBuffer).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binCode = ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!;
  return String(binCode % 1_000_000).padStart(6, "0");
}

test("Super Admin completes first-run setup, is forced through 2FA, and logs back in with it", async ({ page }) => {
  const email = `super-admin-${Date.now()}@example.test`;

  await page.goto(`${ADMIN_URL}/setup`);
  await page.getByLabel(/name/i).fill("Setup Test Admin");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill("a-very-strong-password-123");

  const [setupResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/setup/super-admin") && r.request().method() === "POST"),
    page.getByRole("button", { name: /next/i }).click(),
  ]);
  const { otpauthUrl } = (await setupResponse.json()) as { otpauthUrl: string };
  const secret = new URL(otpauthUrl).searchParams.get("secret");
  expect(secret).toBeTruthy();

  await page.getByLabel("Code").fill(totpCode(secret!));
  await page.getByRole("button", { name: /confirm/i }).click();
  await expect(page.getByRole("button", { name: /go to login/i })).toBeVisible();
  await page.getByRole("button", { name: /go to login/i }).click();

  // Log back in with the password + the now-enabled TOTP — the mandatory-2FA
  // path (not the setup path): login() returns requiresTotp:true since
  // totpEnabled is already true from setup.
  await expect(page).toHaveURL(/\/login/);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill("a-very-strong-password-123");
  await page.getByRole("button", { name: /log in/i }).click();

  await expect(page.getByLabel("Code")).toBeVisible();
  await page.getByLabel("Code").fill(totpCode(secret!));
  await page.getByRole("button", { name: /confirm/i }).click();

  await expect(page).toHaveURL(ADMIN_URL + "/");
  await expect(page.getByText(email)).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
});
