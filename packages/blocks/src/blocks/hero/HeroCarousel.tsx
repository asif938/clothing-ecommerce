"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { wrapSlideIndex } from "./schema.ts";

/**
 * Screen-reader labels only (no visible text) — developer fallbacks in both
 * languages, like the block library's other built-in controls.
 */
const LABELS = {
  bn: { region: "ব্যানার", previous: "আগের স্লাইড", next: "পরের স্লাইড", pause: "স্লাইড থামান", play: "স্লাইড চালু করুন", slide: (n: number, total: number) => `স্লাইড ${n}/${total}` },
  en: { region: "Banner", previous: "Previous slide", next: "Next slide", pause: "Pause slides", play: "Play slides", slide: (n: number, total: number) => `Slide ${n} of ${total}` },
} as const;

const SWIPE_PX = 40;

/**
 * Hero carousel: all slides stacked in one grid cell (so the height is the
 * tallest slide's and nothing jumps) and cross-faded. Moves on its own every
 * `intervalSeconds` unless the shopper paused it, is hovering, touching or
 * focused inside it, the tab is hidden, or the device asks for reduced
 * motion. Dots, arrows and a pause button (WCAG 2.2.2) from `sm` up; on phones
 * swipe, and touching the banner pauses it. Hidden slides are `inert`, so their links can't be tabbed to.
 */
export function HeroCarousel({ slides, autoplay, intervalSeconds, locale }: { slides: ReactNode[]; autoplay: boolean; intervalSeconds: number; locale: string }) {
  const text = LABELS[locale === "en" ? "en" : "bn"];
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const touchStartX = useRef<number | null>(null);
  // Bumped on every manual move so the autoplay timer restarts from zero.
  const [tick, setTick] = useState(0);

  const go = useCallback(
    (step: number) => {
      setIndex((current) => wrapSlideIndex(current, step, count));
      setTick((n) => n + 1);
    },
    [count],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const playing = autoplay && !userPaused && !hovering && !reducedMotion && !tabHidden;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setIndex((current) => wrapSlideIndex(current, 1, count)), intervalSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [playing, index, tick, intervalSeconds, count]);

  const arrow = "absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface/85 text-surface-foreground shadow-sm ring-1 ring-black/5 backdrop-blur-sm transition-colors hover:bg-surface sm:flex";

  return (
    <section
      aria-roledescription="carousel"
      aria-label={text.region}
      className="relative animate-rise"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovering(false);
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
        setHovering(true);
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.clientX;
        touchStartX.current = null;
        setHovering(false);
        if (start === null || end === undefined) return;
        if (end - start > SWIPE_PX) go(-1);
        else if (start - end > SWIPE_PX) go(1);
      }}
    >
      <div className="grid">
        {slides.map((slide, i) => {
          const active = i === index;
          return (
            <div
              key={i}
              role="group"
              aria-roledescription="slide"
              aria-label={text.slide(i + 1, count)}
              aria-hidden={!active}
              inert={!active}
              className={`col-start-1 row-start-1 h-full transition-opacity duration-700 ease-out ${active ? "z-[1] opacity-100" : "pointer-events-none opacity-0"}`}
            >
              {slide}
            </div>
          );
        })}
      </div>

      <button type="button" onClick={() => go(-1)} aria-label={text.previous} className={`${arrow} left-4`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <button type="button" onClick={() => go(1)} aria-label={text.next} className={`${arrow} right-4`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Dots and pause: from `sm` up only. On phones the banner stays clean; shoppers swipe, and touching it pauses autoplay. */}
      <div className="absolute inset-x-0 bottom-5 z-10 hidden items-center justify-center gap-1 sm:flex">
        <div className="flex items-center gap-0.5 rounded-full bg-surface/80 px-1.5 shadow-sm ring-1 ring-black/5 backdrop-blur-sm">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setIndex(i);
                setTick((n) => n + 1);
              }}
              aria-label={text.slide(i + 1, count)}
              aria-current={i === index ? "true" : undefined}
              className="flex h-8 w-6 items-center justify-center"
            >
              <span className={`block h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-4 bg-brand" : "w-1.5 bg-surface-foreground/30"}`} />
            </button>
          ))}
          {autoplay && !reducedMotion && (
            <button type="button" onClick={() => setUserPaused((p) => !p)} aria-label={userPaused ? text.play : text.pause} className="flex h-8 w-7 items-center justify-center text-surface-foreground/70 hover:text-surface-foreground">
              {userPaused ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                  <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
