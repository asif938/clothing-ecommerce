import type { Metadata } from "next";
import "./globals.css";

// Locale routing (bn default, en at /en/...), brand metadata from settings,
// and self-hosted fonts land in Milestone 1/3 (docs/PROJECT_SPEC.md §4.5, §7.6).
export const metadata: Metadata = {
  title: "Storefront",
  description: "Fashion Commerce Platform — storefront",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
