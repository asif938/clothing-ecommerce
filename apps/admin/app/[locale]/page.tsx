import { redirect } from "../../i18n/navigation";

/**
 * No UI of its own — routes straight to the right place depending on
 * whether setup has run yet (§4.4 item 1). Reads `API_URL` directly
 * server-side (infra env, never exposed to the browser).
 */
export default async function AdminRootPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  let hasSuperAdmin = false;
  try {
    const apiUrl = process.env.API_URL ?? "http://localhost:4000";
    const response = await fetch(`${apiUrl}/api/v1/setup/status`, { cache: "no-store" });
    if (response.ok) {
      const data = (await response.json()) as { hasSuperAdmin: boolean };
      hasSuperAdmin = data.hasSuperAdmin;
    }
  } catch {
    // API/database unreachable — fall through to the setup wizard, which
    // reports the real error itself rather than this page doing so.
  }

  redirect({ href: hasSuperAdmin ? "/login" : "/setup", locale });
}
