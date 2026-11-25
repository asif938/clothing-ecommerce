import { t } from "@clothing/shared";
import type { BlockComponentProps } from "../../registry.ts";
import { HeroCarousel } from "./HeroCarousel.tsx";
import { heroSlideLink, type HeroProps, type HeroSlide } from "./schema.ts";
import { BlockLink } from "../../block-link.tsx";

const ALIGN_CLASS = { left: "sm:items-start sm:text-left", center: "sm:items-center sm:text-center", right: "sm:items-end sm:text-right" } as const;
/** Desktop scrim: fades from the side the text sits on, so the copy stays legible over any photo while the other side stays untouched. Tinted with the page color, so it works for light and dark brands alike. */
const SCRIM_CLASS = {
  left: "sm:bg-gradient-to-r sm:from-surface/90 sm:via-surface/55 sm:to-transparent",
  center: "sm:bg-surface/55",
  right: "sm:bg-gradient-to-l sm:from-surface/90 sm:via-surface/55 sm:to-transparent",
} as const;

/** Side-aligned headlines stack into a narrow column so they stay beside the subject of the photo; a centered one can run wide. */
const HEADING_WIDTH_CLASS = { left: "sm:max-w-[11ch]", center: "sm:max-w-3xl", right: "sm:max-w-[11ch]" } as const;

/** Phone portrait art (when given) below `sm`, the main image above. */
function SlideImage({ slide, alt, cover, first }: { slide: HeroSlide; alt: string; cover: boolean; first: boolean }) {
  if (!slide.imageUrl && !slide.mobileImageUrl) return null;
  const imgClass = cover ? "absolute inset-0 -z-20 h-full w-full object-cover" : "block h-auto w-full";
  return (
    <picture className={cover ? "contents" : "block w-full"}>
      {slide.mobileImageUrl && <source media="(max-width: 639.98px)" srcSet={slide.mobileImageUrl} />}
      <img
        src={slide.imageUrl ?? slide.mobileImageUrl ?? undefined}
        alt={alt}
        loading={first ? "eager" : "lazy"}
        fetchPriority={first ? "high" : "low"}
        decoding={first ? "sync" : "async"}
        className={imgClass}
      />
    </picture>
  );
}

function Slide({ slide, locale, first }: { slide: HeroSlide; locale: string; first: boolean }) {
  const lang = locale as "bn" | "en";
  const heading = t(slide.heading, lang).trim();
  const subheading = t(slide.subheading, lang).trim();
  const ctaText = t(slide.ctaText, lang).trim();
  const alt = t(slide.imageAlt, lang).trim();
  const link = heroSlideLink(slide, ctaText);
  const hasText = !!heading || !!subheading || link.kind === "button";
  const cover = slide.fit === "cover";
  // Only the first slide's heading is the page's <h1>; the rest are level-2 so a page never has several.
  const HeadingTag = first ? "h1" : "h2";

  const overlay = hasText ? (
    <div className="mx-auto flex max-w-6xl">
      <div
        className={`flex w-full flex-col items-start justify-end gap-4 px-5 pb-10 sm:justify-center sm:gap-5 sm:px-8 sm:py-20 ${cover ? "min-h-[460px] pt-24 sm:min-h-[560px] lg:min-h-[640px]" : "h-full"} ${ALIGN_CLASS[slide.align]}`}
      >
        {heading && (
          <HeadingTag className={`max-w-[16ch] text-balance text-[2.5rem] leading-[1.05] text-surface-foreground sm:text-6xl lg:text-7xl [:lang(bn)_&]:text-[2.1rem] [:lang(bn)_&]:sm:text-5xl [:lang(bn)_&]:lg:text-[3.5rem] ${HEADING_WIDTH_CLASS[slide.align]}`}>
            {heading}
          </HeadingTag>
        )}
        {subheading && <p className="max-w-md text-pretty text-base text-surface-foreground/80 sm:text-lg">{subheading}</p>}
        {link.kind === "button" && (
          <BlockLink
            href={link.href}
            className="mt-2 inline-flex h-12 items-center rounded-theme bg-brand px-8 text-sm font-medium tracking-wide text-brand-foreground transition-[opacity,transform] duration-300 hover:opacity-90 active:scale-[0.98]"
          >
            {ctaText}
          </BlockLink>
        )}
      </div>
    </div>
  ) : null;

  // No text over the picture: no scrim either, so a designed banner shows exactly as uploaded.
  const scrim = hasText ? <div aria-hidden="true" className={`absolute inset-0 -z-10 bg-gradient-to-t from-surface/95 via-surface/60 via-45% to-transparent ${SCRIM_CLASS[slide.align]}`} /> : null;

  const body = cover ? (
    <div className="relative isolate h-full overflow-hidden bg-muted">
      {/* Picture-only slide: an invisible spacer gives it its 4:5 (phone) / 8:3 shape. Kept off the slide itself so a slider can still stretch it to the tallest slide without it growing wider than the screen. */}
      {!hasText && <div aria-hidden="true" className="aspect-[4/5] w-full sm:aspect-[8/3]" />}
      <SlideImage slide={slide} alt={alt} cover first={first} />
      {scrim}
      {overlay}
    </div>
  ) : (
    // In a slider every slide is as tall as the tallest one; a whole-picture slide sits centred on the muted band.
    <div className="relative isolate flex h-full items-center overflow-hidden bg-muted">
      <SlideImage slide={slide} alt={alt} cover={false} first={first} />
      {hasText && (
        <div className="absolute inset-0">
          {scrim}
          {overlay}
        </div>
      )}
    </div>
  );

  if (link.kind === "image") {
    return (
      <BlockLink href={link.href} aria-label={alt || heading || undefined} className="block h-full">
        {body}
      </BlockLink>
    );
  }
  return body;
}

/**
 * Hero (docs/PROJECT_SPEC.md §9.1): one or more slides. One slide is a still
 * banner; several become a carousel (`HeroCarousel`) that moves on its own
 * every `intervalSeconds` when `autoplay` is on. Each slide's text and button
 * are optional; see `heroSlideLink` for how the link is used.
 */
export function HeroBlock({ props, locale }: BlockComponentProps<HeroProps>) {
  const slides = props.slides.map((slide, index) => <Slide key={index} slide={slide} locale={locale} first={index === 0} />);
  if (slides.length === 1) return <section className="relative animate-rise">{slides[0]}</section>;
  return <HeroCarousel slides={slides} autoplay={props.autoplay} intervalSeconds={props.intervalSeconds} locale={locale} />;
}
