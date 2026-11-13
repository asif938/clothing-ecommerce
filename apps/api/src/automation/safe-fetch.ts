import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** True for loopback, private (RFC1918/ULA), link-local (incl. cloud metadata 169.254.169.254) and unspecified addresses. */
export function isPrivateAddress(address: string): boolean {
  if (address.includes(":")) {
    const a = address.toLowerCase();
    if (a === "::1" || a === "::") return true;
    if (a.startsWith("fe80") || a.startsWith("fc") || a.startsWith("fd")) return true;
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]!) : false;
  }
  const [a, b] = address.split(".").map(Number) as [number, number];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/**
 * Throws unless `url` is https and every address it resolves to is public.
 * Staff supply webhook URLs, so they are untrusted: this blocks
 * loopback/private/link-local/metadata targets (SSRF). Callers must also
 * refuse redirects, since a public host could redirect to a private one.
 */
export async function assertPublicHttpsUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Webhook URL must use https");
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new Error("Webhook URL resolves to a private address");
}

/** Outbound POST for automation `call_webhook` actions: https only, public targets only, short timeout, no redirects. */
export async function postJsonSafely(url: string, body: unknown, fetchImpl: typeof fetch = fetch): Promise<{ status: number }> {
  await assertPublicHttpsUrl(url);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status };
}
