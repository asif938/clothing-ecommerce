import { t } from "@clothing/shared";
import type { BlockComponentProps } from "../../registry.ts";
import { storeApiGet } from "../../store-api.ts";
import type { CategoryTilesProps } from "./schema.ts";

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
    <section className="px-6 py-10">
      {props.heading && <h2 className="mb-4 text-center text-2xl font-semibold text-surface-foreground">{t(props.heading, locale as "bn" | "en")}</h2>}
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {categories.map((category) => {
          const name = t(category.name, locale as "bn" | "en");
          return (
            <a key={category.id} href={`/c/${category.slug}`} className="group flex flex-col gap-2">
              <div className="relative aspect-square overflow-hidden rounded-theme bg-muted">
                {category.imageUrl ? (
                  <img src={category.imageUrl} alt={name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  // No category photo and no product photo yet: a branded tile with the name, never an empty box.
                  <div className="flex h-full w-full items-center justify-center bg-brand p-4 transition-opacity group-hover:opacity-90">
                    <span className="text-center text-xl font-semibold text-brand-foreground sm:text-2xl">{name}</span>
                  </div>
                )}
              </div>
              <span className="text-center text-sm font-medium text-surface-foreground group-hover:underline">{name}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
