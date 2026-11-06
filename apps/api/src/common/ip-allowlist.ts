/** IPv4-only CIDR/exact matching — adequate for the admin IP allow-list (§12) and SSRF guard (private-range checks are IPv4 first too; see `ssrf-guard.ts`). IPv6 entries only match exactly, not by prefix. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    value = (value << 8) + n;
  }
  return value >>> 0;
}

function normalizeIp(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

/** Empty/blank allow-list means "disabled" — every IP passes. */
export function isIpAllowed(ip: string, allowlistCsv: string): boolean {
  const entries = allowlistCsv
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return true;

  const candidate = normalizeIp(ip);
  const candidateInt = ipv4ToInt(candidate);

  for (const entry of entries) {
    if (entry === candidate) return true;

    const [base, prefixStr] = entry.split("/");
    if (prefixStr === undefined || base === undefined || candidateInt === null) continue;
    const prefix = Number(prefixStr);
    const baseInt = ipv4ToInt(base);
    if (baseInt === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) continue;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    if ((baseInt & mask) === (candidateInt & mask)) return true;
  }
  return false;
}
