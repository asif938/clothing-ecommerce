import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";

/**
 * One hero slide. Everything but the image is optional: a banner designed
 * with its text baked in needs no overlay. Linking follows one rule:
 * a button label plus `linkUrl` makes a button; `linkUrl` without a button
 * label makes the whole picture the link; a label without a link shows
 * nothing (the admin form warns).
 */
export const heroSlideSchema = z.object({
  imageUrl: z.string().nullable().default(null),
  /** Optional portrait image for phones (4:5, e.g. 1080×1350). Without it the main image is used, cropped to fit unless `fit` is "contain". */
  mobileImageUrl: z.string().nullable().optional(),
  imageAlt: localizedTextSchema.optional(),
  heading: localizedTextSchema.optional(),
  subheading: localizedTextSchema.optional(),
  ctaText: localizedTextSchema.optional(),
  linkUrl: z.string().optional(),
  align: z.enum(["left", "center", "right"]).default("left"),
  /** "cover" fills the hero and may crop (photos); "contain" always shows the whole image at its own ratio (banners with text in the picture). */
  fit: z.enum(["cover", "contain"]).default("cover"),
});
export type HeroSlide = z.infer<typeof heroSlideSchema>;

/** Seconds between slides when autoplay is on. */
export const HERO_INTERVAL_MIN = 3;
export const HERO_INTERVAL_MAX = 15;

/**
 * Hero props saved before slides existed were a single slide spread over the
 * block (`heading`, `imageUrl`, `ctaUrl`, …). Turn that into the slides shape
 * so existing home pages keep rendering and open correctly in the editor.
 * Anything already in the new shape passes through untouched.
 */
export function upgradeHeroProps(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const props = raw as Record<string, unknown>;
  if (Array.isArray(props.slides)) return props;
  const { heading, subheading, ctaText, ctaUrl, imageUrl, imageAlt, align, ...rest } = props;
  return {
    ...rest,
    slides: [{ imageUrl: imageUrl ?? null, imageAlt, heading, subheading, ctaText, linkUrl: ctaUrl, align }],
  };
}

export const heroSchema = z.preprocess(
  upgradeHeroProps,
  z.object({
    slides: z.array(heroSlideSchema).min(1).max(10),
    /** Move to the next slide on its own (only when there is more than one). */
    autoplay: z.boolean().default(true),
    intervalSeconds: z.number().int().min(HERO_INTERVAL_MIN).max(HERO_INTERVAL_MAX).default(5),
  }),
);
export type HeroProps = z.infer<typeof heroSchema>;

/** Which link a slide shows, per the rule above. */
export function heroSlideLink(slide: Pick<HeroSlide, "ctaText" | "linkUrl">, buttonLabel: string): { kind: "button"; href: string } | { kind: "image"; href: string } | { kind: "none" } {
  const href = slide.linkUrl?.trim();
  if (!href) return { kind: "none" };
  return buttonLabel.trim() ? { kind: "button", href } : { kind: "image", href };
}

/** Index of the slide `step` away from `index`, wrapping around. */
export function wrapSlideIndex(index: number, step: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + step) % count) + count) % count;
}
