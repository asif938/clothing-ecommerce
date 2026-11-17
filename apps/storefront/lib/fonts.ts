import { Hind_Siliguri, Inter, Instrument_Serif, Noto_Sans_Bengali, Noto_Serif_Bengali, Poppins } from "next/font/google";

/**
 * Self-hosted web fonts (next/font downloads them at build time and serves
 * them from our own origin — no request to Google from a shopper's browser).
 *
 * `theme.fontLatin` / `theme.fontBangla` (settings) pick the body pair; the
 * display serif used for headlines is part of the default "premium fashion"
 * look (docs/DECISIONS.md, 2026-11-17). Each font exposes a CSS variable;
 * `fontClassNames` applies only the chosen ones, and `fontStackCss` points the
 * shared `--font-latin-family` / `--font-bangla-family` tokens at them.
 */

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--f-inter" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--f-poppins", preload: false });

const hindSiliguri = Hind_Siliguri({ subsets: ["bengali", "latin"], weight: ["400", "500", "600"], display: "swap", variable: "--f-hind-siliguri" });
const notoSansBengali = Noto_Sans_Bengali({ subsets: ["bengali", "latin"], display: "swap", variable: "--f-noto-sans-bengali", preload: false });
const notoSerifBengali = Noto_Serif_Bengali({ subsets: ["bengali", "latin"], display: "swap", variable: "--f-noto-serif-bengali" });

/** Headline serif — one weight, an italic for rare emphasis. Bangla headlines fall back to Noto Serif Bengali glyph by glyph. */
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], display: "swap", variable: "--f-instrument-serif" });

export type LatinFont = "inter" | "poppins" | "system";
export type BanglaFont = "hind-siliguri" | "noto-sans-bengali" | "noto-serif-bengali";

const LATIN = {
  inter: { variable: inter.variable, stack: "var(--f-inter)" },
  poppins: { variable: poppins.variable, stack: "var(--f-poppins)" },
  system: { variable: "", stack: 'ui-sans-serif, system-ui, "Segoe UI", sans-serif' },
} as const;

const BANGLA = {
  "hind-siliguri": { variable: hindSiliguri.variable, stack: "var(--f-hind-siliguri)" },
  "noto-sans-bengali": { variable: notoSansBengali.variable, stack: "var(--f-noto-sans-bengali)" },
  "noto-serif-bengali": { variable: notoSerifBengali.variable, stack: "var(--f-noto-serif-bengali)" },
} as const;

function pick<T extends Record<string, unknown>>(table: T, value: unknown, fallback: keyof T): keyof T {
  return typeof value === "string" && value in table ? (value as keyof T) : fallback;
}

/** Class names to put on `<html>` so the chosen fonts' CSS variables exist. The display serif and Noto Serif Bengali (its Bangla companion) are always on. */
export function fontClassNames(latinSetting: unknown, banglaSetting: unknown): string {
  const latin = LATIN[pick(LATIN, latinSetting, "inter")];
  const bangla = BANGLA[pick(BANGLA, banglaSetting, "hind-siliguri")];
  return [latin.variable, bangla.variable, instrumentSerif.variable, notoSerifBengali.variable].filter(Boolean).join(" ");
}

/** `:root` declarations wiring the theme font tokens to the chosen fonts. */
export function fontStackCss(latinSetting: unknown, banglaSetting: unknown): string {
  const latin = LATIN[pick(LATIN, latinSetting, "inter")];
  const bangla = BANGLA[pick(BANGLA, banglaSetting, "hind-siliguri")];
  return [
    `--font-latin-family: ${latin.stack}, ui-sans-serif, system-ui, sans-serif;`,
    `--font-bangla-family: ${bangla.stack}, ui-sans-serif, system-ui, sans-serif;`,
    `--font-display-family: var(--f-instrument-serif), var(--f-noto-serif-bengali), Georgia, serif;`,
  ].join(" ");
}
