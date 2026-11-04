import { describe, expect, it } from "vitest";
import { buildProductFeedXml, type FeedItem } from "./feed-xml";

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "v1",
    title: "Cotton Panjabi",
    description: "A comfortable cotton panjabi.",
    link: "https://shop.test/p/cotton-panjabi",
    imageLink: "https://cdn.test/panjabi.jpg",
    availability: "in stock",
    priceAmount: 125000,
    priceCurrency: "BDT",
    brand: "Demo Fashion",
    itemGroupId: "product-1",
    variantLabel: "XL / Navy",
    ...overrides,
  };
}

describe("buildProductFeedXml", () => {
  it("includes every field Meta/Google require per item", () => {
    const xml = buildProductFeedXml({ title: "Demo Fashion", link: "https://shop.test", description: "Catalog", items: [item()] });
    expect(xml).toContain("<g:id>v1</g:id>");
    expect(xml).toContain("<g:availability>in stock</g:availability>");
    expect(xml).toContain("<g:price>1250.00 BDT</g:price>");
    expect(xml).toContain("<g:condition>new</g:condition>");
    expect(xml).toContain("<g:item_group_id>product-1</g:item_group_id>");
    expect(xml).toContain("<link>https://shop.test/p/cotton-panjabi</link>");
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
  });

  it("formats the price as a two-decimal taka amount from poisha", () => {
    const xml = buildProductFeedXml({ title: "t", link: "https://shop.test", description: "d", items: [item({ priceAmount: 99900 })] });
    expect(xml).toContain("<g:price>999.00 BDT</g:price>");
  });

  it("omits g:image_link when there is no image rather than emitting an empty tag", () => {
    const xml = buildProductFeedXml({ title: "t", link: "https://shop.test", description: "d", items: [item({ imageLink: null })] });
    expect(xml).not.toContain("g:image_link");
  });

  it("escapes a title containing a CDATA-closing sequence safely", () => {
    const xml = buildProductFeedXml({ title: "t", link: "https://shop.test", description: "d", items: [item({ title: "Weird ]]> title" })] });
    expect(xml).toContain("]]]]><![CDATA[>");
  });

  it("marks an out-of-stock variant correctly", () => {
    const xml = buildProductFeedXml({ title: "t", link: "https://shop.test", description: "d", items: [item({ availability: "out of stock" })] });
    expect(xml).toContain("<g:availability>out of stock</g:availability>");
  });
});
