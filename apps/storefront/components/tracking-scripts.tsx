import Script from "next/script";

interface TrackingScriptsProps {
  gtmContainerId: string | null;
  metaPixelId: string | null;
  gaMeasurementId: string | null;
  tiktokPixelId: string | null;
  /** §4's cookie-consent setting (M3) — no consent *banner* exists yet to ask the visitor (see docs/DECISIONS.md), so when this is on, tracking scripts simply don't load at all rather than loading without a real consent signal. */
  consentRequired: boolean;
}

/**
 * Client pixel bootstraps (docs/PROJECT_SPEC.md §10.5, §13.1 "defer
 * third-party scripts... after interaction or idle"). `afterInteractive`
 * (next/script's own deferred-but-not-lazy strategy) is the closest fit
 * without adding a new settings-driven timing knob this milestone didn't
 * ask for. `lib/analytics.ts`'s `trackEvent()` pushes to each of these
 * once loaded (`fbq`/`gtag`/`ttq` are all queue-safe before their real
 * script arrives, per each platform's own snippet design).
 */
export function TrackingScripts({ gtmContainerId, metaPixelId, gaMeasurementId, tiktokPixelId, consentRequired }: TrackingScriptsProps) {
  if (consentRequired) return null;

  return (
    <>
      {gtmContainerId && (
        <Script id="gtm-base" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmContainerId}');`}
        </Script>
      )}
      {metaPixelId && (
        <Script id="meta-pixel-base" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${metaPixelId}');fbq('track','PageView');`}
        </Script>
      )}
      {gaMeasurementId && (
        <>
          <Script id="ga4-lib" strategy="afterInteractive" src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`} />
          <Script id="ga4-base" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaMeasurementId}');`}
          </Script>
        </>
      )}
      {tiktokPixelId && (
        <Script id="tiktok-pixel-base" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=o||{};var a=document.createElement("script");a.type="text/javascript",a.async=!0,a.src=i+"?sdkid="+e+"&lib="+t;var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(a,s)};ttq.load('${tiktokPixelId}');ttq.page();}(window,document,'ttq');`}
        </Script>
      )}
    </>
  );
}
