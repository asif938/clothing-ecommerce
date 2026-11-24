import type { HeroProps } from "./schema.ts";

export const heroDefaults: HeroProps = {
  slides: [
    {
      imageUrl: null,
      heading: { bn: "নতুন কালেকশন এসেছে", en: "New collection is here" },
      subheading: { bn: "", en: "" },
      ctaText: { bn: "শপ করুন", en: "Shop now" },
      linkUrl: "/shop",
      align: "left",
      fit: "cover",
    },
  ],
  autoplay: true,
  intervalSeconds: 5,
};
