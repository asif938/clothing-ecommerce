import type { HeroProps } from "./schema.ts";

export const heroDefaults: HeroProps = {
  heading: { bn: "নতুন কালেকশন এসেছে", en: "New collection is here" },
  subheading: { bn: "", en: "" },
  ctaText: { bn: "শপ করুন", en: "Shop now" },
  ctaUrl: "/",
  imageUrl: null,
  align: "left",
};
