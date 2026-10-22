import { t, type LocalizedText } from "@clothing/shared";

export interface ExportableVariant {
  sku: string;
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  barcode: string | null;
  weightGrams: number | null;
}

export interface ExportableProduct {
  slug: string;
  title: LocalizedText;
  status: string;
  tags: string[];
  category: { slug: string } | null;
  variants: ExportableVariant[];
}

/** Flattens products back to the same one-row-per-variant template `row-schema.ts` reads, so export → edit → re-import round-trips. */
export function buildExportRows(products: ExportableProduct[]): Record<string, unknown>[] {
  return products.flatMap((product) =>
    product.variants.map((variant) => ({
      sku: variant.sku,
      productSlug: product.slug,
      productTitleEn: t(product.title, "en"),
      productTitleBn: t(product.title, "bn"),
      categorySlug: product.category?.slug ?? "",
      price: variant.price,
      compareAtPrice: variant.compareAtPrice ?? "",
      costPrice: variant.costPrice ?? "",
      barcode: variant.barcode ?? "",
      weightGrams: variant.weightGrams ?? "",
      status: product.status,
      tags: product.tags.join(","),
    })),
  );
}
