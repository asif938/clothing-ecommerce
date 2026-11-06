import { randomBytes } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { StorageDriver } from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { STORAGE_DRIVER } from "../storage/storage.module";
import { sniffImageMime } from "../media/media-sniff";
import { ReviewsService } from "./reviews.service";
import type { ListApprovedReviewsQueryDto, SubmitReviewDto } from "./dto";

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
  ) {}

  async submit(customerId: string, dto: SubmitReviewDto) {
    const orderItem = await this.prisma.orderItem.findUnique({ where: { id: dto.orderItemId }, include: { order: true, reviews: true } });
    if (!orderItem || orderItem.order.customerId !== customerId) {
      throw new BadRequestException({ code: "NOT_PURCHASED", message: "This item wasn't found on one of your orders." });
    }
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
