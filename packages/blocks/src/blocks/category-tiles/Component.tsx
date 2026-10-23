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
        {categories.map((category) => (
          <a key={category.id} href={`/c/${category.slug}`} className="group flex flex-col gap-2">
            <div className="aspect-square overflow-hidden rounded-theme bg-muted">
              {category.imageUrl && (
                <img src={category.imageUrl} alt={t(category.name, locale as "bn" | "en")} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              )}
            </div>
            <span className="text-center text-sm font-medium text-surface-foreground">{t(category.name, locale as "bn" | "en")}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
