/** Express `trust proxy` from TRUST_PROXY: "1"/"2" → hop count, "false"/"0" → off, anything else (e.g. "loopback, 10.0.0.0/8") is passed as-is. Unset → 1 (Render's own proxy). */
export function parseTrustProxy(value: string | undefined): number | boolean | string {
  const raw = (value ?? "1").trim();
  if (raw === "false" || raw === "0" || raw === "") return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}
