import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../i18n/routing";
import { AnnouncementBar } from "../../components/announcement-bar";
import { BlockRenderer } from "../../components/block-renderer";
import { ChatButtons } from "../../components/chat-buttons";
import { Footer } from "../../components/footer";
import { Header } from "../../components/header";
import { PwaRegister } from "../../components/pwa-register";
import { TrackingScripts } from "../../components/tracking-scripts";
import { UtmCapture } from "../../components/utm-capture";
import { getAnnouncements, getMenu, getPage, getStoreConfig } from "../../lib/store-api";
import { pickForegroundColor } from "../../lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Storefront",
  description: "Fashion Commerce Platform — storefront",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

function localized(value: unknown, locale: string): string {
  if (!value || typeof value !== "object") return "";
  const text = value as { bn?: string; en?: string };
  return text[locale as "bn" | "en"] ?? text.bn ?? text.en ?? "";
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
  const config = await getStoreConfig();

  const brandColor = typeof config["theme.brandColor"] === "string" ? (config["theme.brandColor"] as string) : "#111827";
  const headerVariant = (config["theme.headerVariant"] as "centered" | "left" | "mega" | "minimal" | undefined) ?? "left";
  const footerVariant = (config["theme.footerVariant"] as "columns" | "compact" | undefined) ?? "columns";
  const brandName = localized(config["brand.name"], locale) || "Store";
  const maintenanceMode = config["features.maintenanceMode"] === true;

  const themeStyle = `:root { --color-brand: ${brandColor}; --color-brand-foreground: ${pickForegroundColor(brandColor)}; }`;

  if (maintenanceMode) {
    const maintenancePage = await getPage("maintenance");
    return (
      <html lang={locale}>
        <body className="flex min-h-screen flex-col items-center justify-center">
          <style dangerouslySetInnerHTML={{ __html: themeStyle }} />
          <NextIntlClientProvider locale={locale} messages={messages}>
            {maintenancePage ? <BlockRenderer blocks={maintenancePage.blocksPublished} locale={locale} /> : <p>{brandName}</p>}
          </NextIntlClientProvider>
        </body>
      </html>
    );
  }

  const [announcements, headerMenu, footerMenu] = await Promise.all([getAnnouncements(), getMenu("header"), getMenu("footer")]);
  const baseUrl = process.env.STOREFRONT_URL ?? "http://localhost:3000";
  // Organization + WebSite(SearchAction) structured data (§13.2) — site-wide, so it lives here rather than on any one page.
  const siteLd = [
    { "@context": "https://schema.org", "@type": "Organization", name: brandName, url: baseUrl },
    { "@context": "https://schema.org", "@type": "WebSite", name: brandName, url: baseUrl, potentialAction: { "@type": "SearchAction", target: `${baseUrl}/search?q={search_term_string}`, "query-input": "required name=search_term_string" } },
  ];

  return (
    <html lang={locale}>
      <body className="flex min-h-screen flex-col">
        <style dangerouslySetInnerHTML={{ __html: themeStyle }} />
        {siteLd.map((data, index) => (
          <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
        ))}
        <TrackingScripts
          gtmContainerId={typeof config["tracking.gtmContainerId"] === "string" ? (config["tracking.gtmContainerId"] as string) : null}
          metaPixelId={typeof config["tracking.metaPixelId"] === "string" ? (config["tracking.metaPixelId"] as string) : null}
          gaMeasurementId={typeof config["tracking.gaMeasurementId"] === "string" ? (config["tracking.gaMeasurementId"] as string) : null}
          tiktokPixelId={typeof config["tracking.tiktokPixelId"] === "string" ? (config["tracking.tiktokPixelId"] as string) : null}
          consentRequired={config["features.cookieConsent"] === true}
        />
        <PwaRegister enabled={config["pwa.enabled"] === true} />
        <UtmCapture />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AnnouncementBar bars={announcements} locale={locale} />
          <Header brandName={brandName} logoUrl={null} headerVariant={headerVariant} menu={headerMenu} locale={locale} />
          <main className="flex-1">{children}</main>
          <Footer
            brandName={brandName}
            footerVariant={footerVariant}
            menu={footerMenu}
            phone={typeof config["brand.phone"] === "string" ? (config["brand.phone"] as string) : null}
            email={typeof config["brand.email"] === "string" ? (config["brand.email"] as string) : null}
            locale={locale}
          />
          <ChatButtons
            whatsappEnabled={config["chat.whatsappEnabled"] === true}
            whatsappNumber={typeof config["chat.whatsappNumber"] === "string" ? (config["chat.whatsappNumber"] as string) : null}
            messengerEnabled={config["chat.messengerEnabled"] === true}
            messengerPageUrl={typeof config["chat.messengerPageUrl"] === "string" ? (config["chat.messengerPageUrl"] as string) : null}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
