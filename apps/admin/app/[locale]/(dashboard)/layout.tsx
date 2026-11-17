"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "../../../i18n/navigation";
import { useCurrentStaff } from "../../../lib/use-current-staff";
import { api } from "../../../lib/api";
import { AdminSidebar } from "../../../components/admin-sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("shell");
  const { staff, loading, unauthenticated } = useCurrentStaff();
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPath, setDrawerPath] = useState(pathname);

  // Close the phone drawer when navigation lands somewhere new (set during render, not in an effect).
  if (drawerPath !== pathname) {
    setDrawerPath(pathname);
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (unauthenticated) router.replace("/login");
  }, [unauthenticated, router]);

  useEffect(() => {
    if (staff && !staff.totpEnabled) router.replace("/totp-setup");
  }, [staff, router]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  if (loading || !staff || !staff.totpEnabled) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-surface-foreground/60">…</div>;
  }

  async function handleLogout() {
    await api.post("/auth/logout");
    router.replace("/login");
  }

  async function handleLogoutAll() {
    await api.post("/auth/logout-all");
    router.replace("/login");
  }

  return (
    // The shell is exactly one window tall and never scrolls itself: the sidebar stays put and only <main> scrolls.
    <div className="flex h-dvh overflow-hidden bg-canvas">
      {drawerOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-border bg-surface transition-[transform,visibility] duration-200 lg:visible lg:static lg:z-auto lg:w-[17rem] lg:shrink-0 lg:translate-x-0 ${
          drawerOpen ? "translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <AdminSidebar staff={staff} onNavigate={() => setDrawerOpen(false)} onLogout={() => void handleLogout()} onLogoutAll={() => void handleLogoutAll()} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={t("openMenu")}
            aria-expanded={drawerOpen}
            className="flex h-10 w-10 items-center justify-center rounded-theme text-surface-foreground hover:bg-muted"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="h-5 w-5">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <span className="text-base font-semibold text-surface-foreground">Admin</span>
        </div>
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-[96rem] p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
