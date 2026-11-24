import { randomBytes } from "node:crypto";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@clothing/db";
import type { StorageDriver } from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { STORAGE_DRIVER } from "../storage/storage.module";
import { sniffImageMime } from "../media/media-sniff";
import { ReviewsService } from "./reviews.service";
import type { Env } from "../config/env.schema";
import { signReviewToken, verifyReviewToken } from "./review-link";
import type { ListApprovedReviewsQueryDto, SubmitReviewDto } from "./dto";

type OrderItemWithOrder = Prisma.OrderItemGetPayload<{ include: { order: true; reviews: true } }>;

const DELIVERED_STATUSES = ["delivered", "partially_delivered", "completed"];

/**
 * Storefront-side reviews (docs/PROJECT_SPEC.md §5.5 `order_item_id
 * (verified purchase)`, §16 M8 "photo reviews and fit feedback").
 * Verified purchase means: the order item belongs to an order owned by
 * this customer, the order has actually been delivered (not just placed),
 * and this exact order item hasn't already been reviewed — one review per
 * purchased item, not per product, so buying the same product twice earns
 * two independent review opportunities.
 */
@Injectable()
export class StoreReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly reviews: ReviewsService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  private get encryptionKey(): string {
    return this.config.get("APP_ENCRYPTION_KEY", { infer: true });
  }

  /** The login-free review link for an order (`/review/<token>` on the storefront). */
  reviewToken(orderId: string): string {
    return signReviewToken(orderId, this.encryptionKey);
  }

  async submit(customerId: string, dto: SubmitReviewDto) {
    const orderItem = await this.prisma.orderItem.findUnique({ where: { id: dto.orderItemId }, include: { order: true, reviews: true } });
    if (!orderItem || orderItem.order.customerId !== customerId) {
      throw new BadRequestException({ code: "NOT_PURCHASED", message: "This item wasn't found on one of your orders." });
    }
    return await this.createVerifiedReview(orderItem, customerId, dto);
  }

  /** Same rules as `submit`, but the signed link stands in for the login: the item must be on the link's order. Guest orders (no customer) can review this way. */
  async submitByToken(token: string, dto: SubmitReviewDto) {
    const orderId = this.orderIdFromToken(token);
    const orderItem = await this.prisma.orderItem.findUnique({ where: { id: dto.orderItemId }, include: { order: true, reviews: true } });
    if (!orderItem || orderItem.orderId !== orderId) {
      throw new BadRequestException({ code: "NOT_PURCHASED", message: "This item isn't on this order." });
    }
    return await this.createVerifiedReview(orderItem, orderItem.order.customerId, dto);
  }

  /** What the review page shows for a signed link: the order's items and which are already reviewed. */
  async describeByToken(token: string) {
    const orderId = this.orderIdFromToken(token);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true, status: true, items: { select: { id: true, title: true, sku: true, imageUrl: true, quantity: true, reviews: { select: { id: true }, take: 1 }, variant: { select: { product: { select: { slug: true } } } } } } },
    });
    if (!order) throw new NotFoundException({ code: "REVIEW_LINK_INVALID", message: "This review link isn't valid." });
    return {
      orderNumber: order.orderNumber,
      delivered: DELIVERED_STATUSES.includes(order.status),
      items: order.items.map((item) => ({ id: item.id, title: item.title, sku: item.sku, imageUrl: item.imageUrl, quantity: item.quantity, productSlug: item.variant.product.slug, reviewed: item.reviews.length > 0 })),
    };
  }

  /** Photo upload for the link flow: only while the link's order is delivered (the same people who could submit). */
  async uploadPhotoByToken(token: string, file: { buffer: Buffer; mimetype: string; originalname: string }) {
    const order = await this.prisma.order.findUnique({ where: { id: this.orderIdFromToken(token) }, select: { status: true } });
    if (!order || !DELIVERED_STATUSES.includes(order.status)) {
      throw new BadRequestException({ code: "NOT_DELIVERED", message: "You can review an item once it's been delivered." });
    }
    return await this.uploadPhoto(file);
  }

  /**
   * For the product page's "Write a review" button: a logged-in customer's
   * delivered, not-yet-reviewed purchase of this product, as a review link.
   * Null when there's none (guests get their link by SMS instead).
   */
  async eligibility(customerId: string | null, productId: string): Promise<{ reviewUrl: string | null }> {
    if (!customerId) return { reviewUrl: null };
    const item = await this.prisma.orderItem.findFirst({
      where: { variant: { productId }, reviews: { none: {} }, order: { customerId, status: { in: DELIVERED_STATUSES as never } } },
      orderBy: { order: { deliveredAt: "desc" } },
      select: { orderId: true },
    });
    return { reviewUrl: item ? `/review/${this.reviewToken(item.orderId)}` : null };
  }

  async linkForCustomerOrder(customerId: string, orderId: string): Promise<{ reviewUrl: string }> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
    if (!order || order.customerId !== customerId) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Order not found." });
    return { reviewUrl: `/review/${this.reviewToken(orderId)}` };
  }

  private orderIdFromToken(token: string): string {
    const orderId = verifyReviewToken(token, this.encryptionKey);
    if (!orderId) throw new NotFoundException({ code: "REVIEW_LINK_INVALID", message: "This review link isn't valid." });
    return orderId;
  }

  private async createVerifiedReview(orderItem: OrderItemWithOrder, customerId: string | null, dto: SubmitReviewDto) {
    if (!DELIVERED_STATUSES.includes(orderItem.order.status)) {
      throw new BadRequestException({ code: "NOT_DELIVERED", message: "You can review an item once it's been delivered." });
    }
    if (orderItem.reviews.length > 0) {
      throw new BadRequestException({ code: "ALREADY_REVIEWED", message: "You've already reviewed this item." });
    }

    const autoApprove = await this.settings.getValue<boolean>("reviews.autoApprove");
    const review = await this.prisma.review.create({
      data: {
        productId: await this.resolveProductId(orderItem.variantId),
        variantId: orderItem.variantId,
        orderItemId: orderItem.id,
        customerId,
        rating: dto.rating,
        title: dto.title,
        body: dto.body,
        fitFeedback: dto.fitFeedback,
        mediaUrls: dto.mediaUrls,
        status: autoApprove ? "approved" : "pending",
      },
    });
    if (autoApprove) await this.reviews.recomputeProductRating(review.productId);
    return review;
  }

  private async resolveProductId(variantId: string): Promise<string> {
    const variant = await this.prisma.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { productId: true } });
    return variant.productId;
  }

  async listApproved(productId: string, query: ListApprovedReviewsQueryDto) {
    const where = { productId, status: "approved" as const };
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: [{ helpfulCount: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          rating: true,
          title: true,
          body: true,
          fitFeedback: true,
          mediaUrls: true,
          adminReply: true,
          helpfulCount: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** §12 "file upload validation (MIME sniffing ...)" — this is the one unauthenticated upload surface in the app (any shopper with a delivered order), so it's the one most worth not trusting the client's claimed type or filename extension for. */
  async uploadPhoto(file: { buffer: Buffer; mimetype: string; originalname: string }): Promise<{ url: string }> {
    const sniffedMime = sniffImageMime(file.buffer);
    if (!sniffedMime) {
      throw new BadRequestException({ code: "UNRECOGNIZED_IMAGE", message: "This doesn't look like a JPEG, PNG, GIF, or WebP file" });
    }
    const extension = sniffedMime.split("/")[1];
    const key = `reviews/${new Date().getFullYear()}/${randomBytes(8).toString("hex")}.${extension}`;
    await this.storage.put(key, file.buffer, sniffedMime);
    return { url: this.storage.publicUrl(key) };
  }
}
