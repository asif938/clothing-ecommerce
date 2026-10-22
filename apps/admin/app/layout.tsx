import type { Metadata } from "next";
import "./globals.css";

// The setup wizard (first run, no Super Admin yet), staff auth + 2FA, and the
// admin shell (sidebar, Cmd+K, tables/forms kit) land in Milestone 1
// (docs/PROJECT_SPEC.md §4.4.1, §8.1).
export const metadata: Metadata = {
  title: "Admin",
  description: "Fashion Commerce Platform — admin panel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
