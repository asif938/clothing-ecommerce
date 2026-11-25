import { t } from "@clothing/shared";
import type { BlockComponentProps } from "../../registry.ts";
import { SectionHeading } from "../../section-heading.tsx";
import { storeApiGet } from "../../store-api.ts";
import type { CategoryTilesProps } from "./schema.ts";
import { BlockLink } from "../../block-link.tsx";

interface CategoryCard {
  id: string;
  slug: string;
  name: { bn?: string; en?: string };
  imageUrl: string | null;
}

export async function CategoryTilesBlock({ props, locale }: BlockComponentProps<CategoryTilesProps>) {
  if (props.categoryIds.length === 0) return null;
  const categories = await storeApiGet<CategoryCard[]>(`/store/catalog/categories?ids=${props.categoryIds.join(",")}`);
  if (!categories || categories.length === 0) return null;

  return (
    <section className="px-4 py-12 sm:px-8 sm:py-20">
      {props.heading && <SectionHeading>{t(props.heading, locale as "bn" | "en")}</SectionHeading>}
      {/* Wrapping flex rather than a grid so 3 (or 5) tiles stay centered instead of leaving a gap on the right. */}
      <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-3 sm:gap-5">
        {categories.map((category) => {
          const name = t(category.name, locale as "bn" | "en");
          return (
            <BlockLink key={category.id} href={`${locale === "en" ? "/en" : ""}/c/${category.slug}`} className="group relative aspect-[4/5] basis-[calc(50%-0.375rem)] overflow-hidden rounded-theme bg-muted sm:basis-[calc(25%-0.9375rem)]">
              {category.imageUrl ? (
                <img src={category.imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]" />
              ) : (
                // No category photo and no product photo yet: a branded plate, never an empty box.
                <div className="absolute inset-0 bg-brand" />
              )}
              <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/60 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-4 font-display text-xl leading-tight text-white sm:p-5 sm:text-2xl">
                {name}
                <span aria-hidden="true" className="mt-2 block h-px w-6 bg-white/70 transition-[width] duration-500 ease-out group-hover:w-12" />
              </span>
            </BlockLink>
          );
        })}
      </div>
    </section>
  );
}
