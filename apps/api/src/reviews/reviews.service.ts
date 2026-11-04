import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { ListReviewsQueryDto, ModerateReviewDto } from "./dto";

/**
 * Review moderation (docs/PROJECT_SPEC.md §5.5, §8.2 "Reviews moderation
 * and Q&A"). `Product.ratingAvg`/`ratingCount` (built M2, read on the PDP
 * since M4) are recomputed from *approved* reviews only, every time a
 * review's status changes — simple full recompute, not an incremental
 * running average, since review volume per product is small enough that
 * this is never a real cost.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListReviewsQueryDto) {
    const where = { ...(query.productId ? { productId: query.productId } : {}), ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { product: { select: { title: true, slug: true } }, customer: { select: { name: true, phone: true } } },
      }),
      this.prisma.review.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async moderate(id: string, dto: ModerateReviewDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.review.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Review not found");

    const review = await this.prisma.review.update({ where: { id }, data: { status: dto.status, adminReply: dto.adminReply } });
    await this.recomputeProductRating(review.productId);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "review.moderate", entityType: "review", entityId: id, before, after: review });
    return review;
  }

  async markHelpful(id: string) {
    return this.prisma.review.update({ where: { id }, data: { helpfulCount: { increment: 1 } } });
  }

  async recomputeProductRating(productId: string): Promise<void> {
    const result = await this.prisma.review.aggregate({ where: { productId, status: "approved" }, _avg: { rating: true }, _count: { _all: true } });
    await this.prisma.product.update({
      where: { id: productId },
      data: { ratingAvg: result._avg.rating ?? 0, ratingCount: result._count._all },
    });
  }
}
