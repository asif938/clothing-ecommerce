import "server-only";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

function localized(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const text = value as { bn?: string; en?: string };
  return text.en ?? text.bn;
}

/** Server-only: brand name + colour from the public store config, with neutral fallbacks if the API is unreachable (e.g. while building). */
export async function getBrandIdentity(): Promise<{ name: string; color: string }> {
  try {
    const response = await fetch(`${API_URL}/api/v1/store/config`, { next: { revalidate: 300 } });
    if (!response.ok) throw new Error(String(response.status));
    const config = (await response.json()) as Record<string, unknown>;
    return {
      name: localized(config["brand.name"]) ?? "Store",
      color: typeof config["theme.brandColor"] === "string" ? (config["theme.brandColor"] as string) : "#111827",
    };
  } catch {
    return { name: "Store", color: "#111827" };
  }
}
