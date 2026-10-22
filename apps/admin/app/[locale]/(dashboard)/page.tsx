"use client";

import { useCurrentStaff } from "../../../lib/use-current-staff";

export default function DashboardHomePage() {
  const { staff } = useCurrentStaff();
  return (
    <div>
      <h1 className="text-2xl font-semibold text-surface-foreground">
        {staff ? `Welcome, ${staff.name}` : "Welcome"}
      </h1>
      <p className="mt-2 text-sm text-surface-foreground/70">
        KPIs and reports land in Milestone 8. Use the sidebar to manage settings, staff, media, integrations, and the
        audit log.
      </p>
    </div>
  );
}
