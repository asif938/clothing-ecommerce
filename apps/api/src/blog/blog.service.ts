import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { validateBlocks, type BlockInstanceLike } from "@clothing/blocks/schemas";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RevalidationService } from "../revalidation/revalidation.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateBlogPostDto, ListBlogPostsQueryDto, UpdateBlogPostBlocksDto, UpdateBlogPostDto } from "./dto";

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

const ENTITY_TYPE = "blog_post";

/**
 * Blog/lookbook (docs/PROJECT_SPEC.md §16 M10) — reuses the exact
 * `blocksDraft`/`blocksPublished` draft/publish shape `PagesService`
 * established in M3, deliberately without that service's edit-lock or
 * version history (a smaller MVP trade-off than pages get — see
 * docs/DECISIONS.md). A "lookbook" post is just one built from the
 * `lookbook` block type; there is nothing else to build for it here.
 */
@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  async list() {
    return await this.prisma.blogPost.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } });
  }

  async get(id: string) {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post || post.deletedAt) throw new NotFoundException("Blog post not found");
    return post;
  }

  async create(dto: CreateBlogPostDto, actor: AuthenticatedStaff) {
    const existing = await this.prisma.blogPost.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new BadRequestException({ code: "SLUG_TAKEN", message: `Slug "${dto.slug}" is already in use` });

    const post = await this.prisma.blogPost.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        excerpt: toJsonInput(dto.excerpt),
        coverMediaId: dto.coverMediaId ?? null,
        tags: dto.tags ?? [],
        seoTitle: toJsonInput(dto.seoTitle),
        seoDescription: toJsonInput(dto.seoDescription),
        blocksDraft: [],
        authorStaffId: actor.id,
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "blog_post.create", entityType: ENTITY_TYPE, entityId: post.id, after: { slug: dto.slug } });
    return post;
  }

  async update(id: string, dto: UpdateBlogPostDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    if (dto.slug && dto.slug !== before.slug) {
      const existing = await this.prisma.blogPost.findUnique({ where: { slug: dto.slug } });
      if (existing) throw new BadRequestException({ code: "SLUG_TAKEN", message: `Slug "${dto.slug}" is already in use` });
    }

    const post = await this.prisma.blogPost.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.excerpt !== undefined ? { excerpt: toJsonInput(dto.excerpt) } : {}),
        ...(dto.coverMediaId !== undefined ? { coverMediaId: dto.coverMediaId } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.seoTitle !== undefined ? { seoTitle: toJsonInput(dto.seoTitle) } : {}),
        ...(dto.seoDescription !== undefined ? { seoDescription: toJsonInput(dto.seoDescription) } : {}),
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "blog_post.update", entityType: ENTITY_TYPE, entityId: id, before: { title: before.title }, after: { title: post.title } });
    if (before.status === "published") await this.revalidation.revalidate([`blog_post:${post.slug}`, "blog_posts"]);
    return post;
  }

  async updateBlocks(id: string, dto: UpdateBlogPostBlocksDto, actor: AuthenticatedStaff) {
    await this.get(id);
    const { valid, errors } = validateBlocks(dto.blocks as BlockInstanceLike[], actor.isSuperAdmin);
    if (errors.length > 0) throw new BadRequestException({ code: "BLOCK_VALIDATION_ERROR", message: "One or more blocks failed validation", errors });
    return await this.prisma.blogPost.update({ where: { id }, data: { blocksDraft: valid as unknown as Prisma.InputJsonValue } });
  }

  async publish(id: string, actor: AuthenticatedStaff) {
    const post = await this.get(id);
    const updated = await this.prisma.blogPost.update({
      where: { id },
      data: { status: "published", publishedAt: post.publishedAt ?? new Date(), blocksPublished: post.blocksDraft as Prisma.InputJsonValue },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "blog_post.publish", entityType: ENTITY_TYPE, entityId: id, after: { slug: post.slug } });
    await this.revalidation.revalidate([`blog_post:${post.slug}`, "blog_posts"]);
    return updated;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const post = await this.get(id);
    await this.prisma.blogPost.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "blog_post.delete", entityType: ENTITY_TYPE, entityId: id, before: { slug: post.slug } });
    await this.revalidation.revalidate([`blog_post:${post.slug}`, "blog_posts"]);
  }

  /** Public — only ever returns a currently-published post (store controller). */
  async getPublishedBySlug(slug: string) {
    const post = await this.prisma.blogPost.findUnique({ where: { slug } });
    if (!post || post.deletedAt || post.status !== "published" || post.blocksPublished === null) return null;
    return post;
  }

  async listPublished(query: ListBlogPostsQueryDto) {
    const where: Prisma.BlogPostWhereInput = { deletedAt: null, status: "published", ...(query.tag ? { tags: { has: query.tag } } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.blogPost.findMany({ where, orderBy: { publishedAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.blogPost.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
