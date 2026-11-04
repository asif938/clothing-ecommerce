/**
 * Meta catalog / Google Merchant feed (docs/PROJECT_SPEC.md §10.5). Both
 * platforms accept the same Google-Shopping-style RSS 2.0 + `g:` namespace
 * XML, so one builder serves both endpoints — documented explicitly in
 * `FeedsService`, not a coincidence. One `FeedItem` per *variant* (§10.5:
 * "including variants as items with item_group_id"), not per product.
 */
export interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string | null;
  availability: "in stock" | "out of stock";
  priceAmount: number;
  priceCurrency: string;
  brand: string;
  itemGroupId: string;
  /** e.g. "XL / Navy" — shown by both platforms as the variant's own distinguishing attributes. */
  variantLabel: string | null;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function itemXml(item: FeedItem): string {
  return [
    "<item>",
    `<g:id>${escapeXml(item.id)}</g:id>`,
    `<title>${cdata(item.title)}</title>`,
    `<description>${cdata(item.description)}</description>`,
    `<link>${escapeXml(item.link)}</link>`,
    item.imageLink ? `<g:image_link>${escapeXml(item.imageLink)}</g:image_link>` : "",
    `<g:availability>${item.availability}</g:availability>`,
    `<g:price>${(item.priceAmount / 100).toFixed(2)} ${item.priceCurrency}</g:price>`,
    `<g:brand>${cdata(item.brand)}</g:brand>`,
    `<g:condition>new</g:condition>`,
    `<g:item_group_id>${escapeXml(item.itemGroupId)}</g:item_group_id>`,
    item.variantLabel ? `<g:product_type>${cdata(item.variantLabel)}</g:product_type>` : "",
    "</item>",
  ]
    .filter(Boolean)
    .join("");
}

export function buildProductFeedXml(input: { title: string; link: string; description: string; items: FeedItem[] }): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "<channel>",
    `<title>${cdata(input.title)}</title>`,
    `<link>${escapeXml(input.link)}</link>`,
    `<description>${cdata(input.description)}</description>`,
    ...input.items.map(itemXml),
    "</channel>",
    "</rss>",
  ].join("");
}
