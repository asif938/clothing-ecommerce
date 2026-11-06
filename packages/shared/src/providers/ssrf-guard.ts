import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * §12 "SSRF protection on any URL-fetching feature ... generic HTTP
 * providers: block private IP ranges". Applied to the one driver whose
 * whole point is fetching an admin-typed arbitrary URL
 * (`sms-generic-http.ts`) — the other drivers hit vendor-fixed endpoints,
 * not admin-supplied ones.
 *
 * Resolves the hostname and checks the *resolved* address, not just the
 * literal hostname string, so a DNS name that only resolves to a private
 * address (DNS rebinding) is caught too.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Not a valid URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported URL scheme "${url.protocol}" — only http/https are allowed`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (hostname === "localhost") {
    throw new Error("Refusing to fetch a localhost URL");
  }

  const addresses: string[] = [];
  if (isIP(hostname)) {
    addresses.push(hostname);
  } else {
    const resolved = await lookup(hostname, { all: true }).catch(() => []);
    addresses.push(...resolved.map((entry) => entry.address));
  }

  if (addresses.length === 0) {
    throw new Error(`Could not resolve hostname "${hostname}"`);
  }
  for (const address of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new Error(`Refusing to fetch "${hostname}" — it resolves to a private/reserved address (${address})`);
    }
  }
}

function isPrivateOrReservedIp(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  if (isIP(address) === 6) return isPrivateIpv6(address);
  return true; // not a recognizable IP at all — fail closed
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 0) return true; // 0.0.0.0/8
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (normalized.startsWith("::ffff:")) return isPrivateIpv4(normalized.slice(7));
  if (normalized.startsWith("fe80:")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local (fc00::/7)
  return false;
}
