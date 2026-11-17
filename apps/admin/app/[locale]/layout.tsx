import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { Hind_Siliguri, Inter } from "next/font/google";
import { routing } from "../../i18n/routing";
import "./globals.css";

// Self-hosted at build time. Inter for Latin, Hind Siliguri for Bangla (the pair suggested in docs/DECISIONS.md); the browser picks per glyph.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--f-inter" });
const hindSiliguri = Hind_Siliguri({ subsets: ["bengali", "latin"], weight: ["400", "500", "600"], display: "swap", variable: "--f-hind-siliguri" });

export const metadata: Metadata = {
  title: "Admin",
  description: "Fashion Commerce Platform — admin panel",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const messages = await getMessages();

  return (
    <html lang={locale} dir="ltr" className={`${inter.variable} ${hindSiliguri.variable}`}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
