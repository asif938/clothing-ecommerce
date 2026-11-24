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
import { RewardsCapture } from "../../components/rewards-capture";
import { OfferExperimentStrip } from "../../components/offer-experiment-strip";
import { ProductActionsProvider } from "../../components/product-actions-provider";
import { resolveCardText } from "../../lib/card-text";
import { getAnnouncements, getMenu, getPage, getStoreConfig, getUiStrings } from "../../lib/store-api";
import { fontClassNames, fontStackCss } from "../../lib/fonts";
import { pickForegroundColor, safeHexColor, serializeJsonLd } from "../../lib/theme";
import "./globals.css";

/** A setting holding an image URL, or null when it is unset or blank. */
function imageSetting(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export async function generateMetadata(): Promise<Metadata> {
  // `brand.favicon` (admin → Settings → Brand); without one the browser keeps its default icon.
  const favicon = imageSetting((await getStoreConfig())["brand.favicon"]);
  return {
    title: "Storefront",
    description: "Fashion Commerce Platform — storefront",
    ...(favicon ? { icons: { icon: favicon, apple: favicon } } : {}),
  };
}

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

  const brandColor = safeHexColor(config["theme.brandColor"], "#111827");
  const headerVariant = (config["theme.headerVariant"] as "centered" | "left" | "mega" | "minimal" | undefined) ?? "left";
  const footerVariant = (config["theme.footerVariant"] as "columns" | "compact" | undefined) ?? "columns";
  const brandName = localized(config["brand.name"], locale) || "Store";
  const maintenanceMode = config["features.maintenanceMode"] === true;
  // Navbar sits on the light page, the footer on the dark brand color — hence two logo files (admin → Settings → Brand).
  const logoLight = imageSetting(config["brand.logoLight"]);
  const logoDark = imageSetting(config["brand.logoDark"]);

  const fontLatin = config["theme.fontLatin"];
  const fontBangla = config["theme.fontBangla"];
  const fontClasses = fontClassNames(fontLatin, fontBangla);
  const themeStyle = `:root { --color-brand: ${brandColor}; --color-brand-foreground: ${pickForegroundColor(brandColor)}; ${fontStackCss(fontLatin, fontBangla)} }`;

  if (maintenanceMode) {
    const maintenancePage = await getPage("maintenance");
    return (
      <html lang={locale} className={fontClasses}>
        <body className="flex min-h-screen flex-col items-center justify-center">
          <style dangerouslySetInnerHTML={{ __html: themeStyle }} />
          <NextIntlClientProvider locale={locale} messages={messages}>
            {maintenancePage ? <BlockRenderer blocks={maintenancePage.blocksPublished} locale={locale} /> : <p>{brandName}</p>}
          </NextIntlClientProvider>
        </body>
      </html>
    );
  }

  const [announcements, headerMenu, footerMenu, uiStrings] = await Promise.all([getAnnouncements(), getMenu("header"), getMenu("footer"), getUiStrings()]);
  const baseUrl = process.env.STOREFRONT_URL ?? "http://localhost:3000";
  // Organization + WebSite(SearchAction) structured data (§13.2) — site-wide, so it lives here rather than on any one page.
  const siteLd = [
    { "@context": "https://schema.org", "@type": "Organization", name: brandName, url: baseUrl },
    { "@context": "https://schema.org", "@type": "WebSite", name: brandName, url: baseUrl, potentialAction: { "@type": "SearchAction", target: `${baseUrl}/search?q={search_term_string}`, "query-input": "required name=search_term_string" } },
  ];

  return (
    <html lang={locale} className={fontClasses}>
      <body className="flex min-h-screen flex-col">
        <style dangerouslySetInnerHTML={{ __html: themeStyle }} />
        {siteLd.map((data, index) => (
          <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
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
        <RewardsCapture />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AnnouncementBar bars={announcements} locale={locale} />
          {config["experiments.enabled"] === true && <OfferExperimentStrip locale={locale} />}
          <Header brandName={brandName} logoUrl={logoLight} headerVariant={headerVariant} menu={headerMenu} locale={locale} uiStrings={uiStrings} visualSearch={config["visualSearch.enabled"] === true} />
          <main className="flex-1">
            <ProductActionsProvider text={resolveCardText(uiStrings, locale)}>{children}</ProductActionsProvider>
          </main>
          <Footer
            brandName={brandName}
            logoUrl={logoDark}
            footerVariant={footerVariant}
            menu={footerMenu}
            phone={typeof config["brand.phone"] === "string" ? (config["brand.phone"] as string) : null}
            email={typeof config["brand.email"] === "string" ? (config["brand.email"] as string) : null}
            locale={locale}
            uiStrings={uiStrings}
          />
          <ChatButtons
            liveChatEnabled={config["support.liveChat.enabled"] === true}
            locale={locale}
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
