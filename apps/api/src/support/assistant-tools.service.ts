import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { Prisma } from "@clothing/db";
import { normalizeBdPhone } from "@clothing/shared";
import { PrismaService } from "../prisma/prisma.service";
import { SearchService } from "../search/search.service";
import { StoreCatalogService } from "../store-catalog/store-catalog.service";
import { SizeRecommenderService } from "../size-recommender/size-recommender.service";

/** Tool results are capped so a big product can't blow up the prompt (and the AI bill). */
const MAX_RESULT_CHARS = 3000;

type Localized = { bn?: string; en?: string } | null | undefined;

function text(value: unknown): string {
  if (typeof value === "string") return value;
  const v = value as Localized;
  return v ? [v.en, v.bn].filter(Boolean).join(" / ") : "";
}

function taka(poisha: number): string {
  return `৳${Math.round(poisha / 100).toLocaleString("en-US")}`;
}

function storefrontUrl(path: string): string {
  return `${(process.env.STOREFRONT_URL ?? "").replace(/\/$/, "")}${path}`;
}

const searchInput = z.object({ query: z.string().trim().min(1).max(120) });
const productInput = z.object({ slug: z.string().trim().min(1).max(200) });
const sizeInput = z.object({
  slug: z.string().trim().min(1).max(200),
  height_cm: z.number().positive().max(250).optional(),
  weight_kg: z.number().positive().max(300).optional(),
  chest_cm: z.number().positive().max(250).optional(),
  waist_cm: z.number().positive().max(250).optional(),
  fit: z.enum(["snug", "regular", "loose"]).optional(),
});
const orderInput = z.object({ order_number: z.string().trim().min(3).max(40), phone: z.string().trim().max(20).optional() });

export interface ToolContext {
  /** The phone the channel itself vouches for (WhatsApp) or the customer's account phone — preferred over a typed one. */
  trustedPhone: string | null;
  customerId: string | null;
}

export interface ToolOutcome {
  content: string;
  isError: boolean;
}

/**
 * The chat assistant's tools (docs/PROJECT_SPEC.md §10.4 "tool calls to our
 * API, with strict guardrails", §16 M15). Every input is re-validated here
 * (the model's JSON is untrusted), results are plain facts the model must
 * quote rather than invent, and order lookups only ever return an order
 * whose phone matches the chat.
 */
@Injectable()
export class AssistantToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchService,
    private readonly catalog: StoreCatalogService,
    private readonly sizes: SizeRecommenderService,
  ) {}

  async run(name: string, input: unknown, context: ToolContext): Promise<ToolOutcome> {
    try {
      const result = await this.dispatch(name, input, context);
      const json = JSON.stringify(result);
      return { content: json.length > MAX_RESULT_CHARS ? `${json.slice(0, MAX_RESULT_CHARS)}…` : json, isError: false };
    } catch (error) {
      const message = error instanceof z.ZodError ? `Invalid input: ${error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` : error instanceof Error ? error.message : "Tool failed";
      return { content: JSON.stringify({ error: message }), isError: true };
    }
  }

  private async dispatch(name: string, input: unknown, context: ToolContext): Promise<unknown> {
    switch (name) {
      case "search_products":
        return await this.searchProducts(searchInput.parse(input).query);
      case "get_product":
        return await this.getProduct(productInput.parse(input).slug);
      case "size_advice":
        return await this.sizeAdvice(sizeInput.parse(input), context);
      case "order_status":
        return await this.orderStatus(orderInput.parse(input), context);
      default:
        throw new Error(`Unknown tool "${name}"`);
    }
  }

  private async searchProducts(query: string) {
    const result = await this.search.search({ q: query, page: 1, pageSize: 5 });
    if (result.data.length === 0) return { found: 0, products: [], note: "Nothing matched. Ask the customer to describe it differently, or suggest browsing the site." };
    const ids = result.data.map((p) => p.id);
    // Same rule as the PDP: stock at locations that fulfil online orders.
    const stock = await this.prisma.$queryRaw<{ product_id: string; available: bigint | number }[]>`
      SELECT v.product_id, COALESCE(SUM(GREATEST(l.on_hand - l.reserved, 0)), 0) AS available
      FROM product_variants v
      LEFT JOIN inventory_levels l ON l.variant_id = v.id
      LEFT JOIN stock_locations sl ON sl.id = l.location_id
      WHERE v.product_id IN (${Prisma.join(ids)}) AND v.is_active = true AND (sl.id IS NULL OR sl.fulfills_online = true)
      GROUP BY v.product_id`;
    const inStock = new Map(stock.map((s) => [s.product_id, Number(s.available) > 0]));
    return {
      found: result.meta.total,
      products: result.data.map((p) => ({
        title: text(p.title),
        slug: p.slug,
        price_from: taka(p.priceFrom),
        compare_at: p.compareAtFrom ? taka(p.compareAtFrom) : null,
        in_stock: inStock.get(p.id) ?? null,
        link: storefrontUrl(`/p/${p.slug}`),
      })),
    };
  }

  private async getProduct(slug: string) {
    const product = await this.catalog.getProductBySlug(slug);
    if (!product) return { found: false, note: "No active product with that slug." };
    const valueName = new Map(product.options.flatMap((o) => o.values.map((v) => [v.id, text(v.value)] as const)));
    const prices = product.variants.filter((v) => v.isActive).map((v) => v.price);
    return {
      found: true,
      title: text(product.title),
      link: storefrontUrl(`/p/${product.slug}`),
      price: prices.length ? (Math.min(...prices) === Math.max(...prices) ? taka(prices[0]!) : `${taka(Math.min(...prices))}–${taka(Math.max(...prices))}`) : null,
      options: product.options.map((o) => ({ name: text(o.name), values: o.values.map((v) => text(v.value)) })),
      variants: product.variants
        .filter((v) => v.isActive)
        .slice(0, 40)
        .map((v) => ({ option_values: v.optionValueIds.map((id) => valueName.get(id) ?? "").filter(Boolean).join(" / "), price: taka(v.price), in_stock: v.available, low_stock: v.lowStock })),
      fabric: text(product.fabric),
      care: text(product.careInstructions),
      model_info: text(product.modelInfo),
      has_size_chart: product.sizeChart !== null,
      preorder_release_date: product.preorderReleaseDate,
    };
  }

  private async sizeAdvice(input: z.infer<typeof sizeInput>, context: ToolContext) {
    const measurements = { heightCm: input.height_cm, weightKg: input.weight_kg, chestCm: input.chest_cm, waistCm: input.waist_cm };
    const given = Object.values(measurements).some((v) => v !== undefined);
    const result = await this.sizes.recommendForProduct(input.slug, context.customerId, { measurements: given ? measurements : undefined, fitPreference: input.fit });
    return result;
  }

  private async orderStatus(input: z.infer<typeof orderInput>, context: ToolContext) {
    const phone = context.trustedPhone ?? (input.phone ? normalizeBdPhone(input.phone) : null);
    if (!phone) return { found: false, note: "Ask the customer for the phone number used on the order." };
    const order = await this.prisma.order.findUnique({
      where: { orderNumber: input.order_number.toUpperCase() },
      include: { items: { select: { title: true, quantity: true } }, shipments: { select: { courierDriver: true, consignmentId: true, trackingCode: true, status: true } } },
    });
    const orderPhone = (order?.billingContact as { phone?: string } | null)?.phone ?? null;
    // Same answer for "no such order" and "not your order" — never confirm that someone else's order exists.
    if (!order || orderPhone !== phone) return { found: false, note: "No order with that number for this phone number." };
    return {
      found: true,
      order_number: order.orderNumber,
      placed_at: order.createdAt.toISOString().slice(0, 10),
      status: order.status,
      payment_status: order.paymentStatus,
      fulfillment_status: order.fulfillmentStatus,
      total: taka(order.total),
      cash_to_collect: order.codAmount > 0 ? taka(order.codAmount) : null,
      items: order.items.map((i) => `${i.quantity} × ${text(i.title)}`),
      shipments: order.shipments.map((s) => ({ courier: s.courierDriver, tracking_code: s.trackingCode ?? s.consignmentId, status: s.status })),
      tracking_page: storefrontUrl("/track"),
    };
  }
}
