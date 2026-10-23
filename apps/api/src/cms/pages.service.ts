import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { validateBlocks, type BlockInstanceLike } from "@clothing/blocks/schemas";
import sanitizeHtml from "sanitize-html";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RevalidationService } from "../revalidation/revalidation.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreatePageDto, SchedulePageDto, UpdatePageBlocksDto, UpdatePageDto } from "./dto";

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

/**
 * `custom_html` is the one block type allowed to render raw HTML
 * (docs/PROJECT_SPEC.md §9.1, §12 "rich-text sanitization ... on save and
 * render") — sanitized once here, at save time, with `sanitize-html`'s
 * default allow-list (strips `<script>`, inline event handlers, etc.), so
 * the storefront's `CustomHtmlBlock` can render it with
 * `dangerouslySetInnerHTML` and genuinely never see unsanitized input.
 */
function sanitizeCustomHtmlBlocks(blocks: BlockInstanceLike[]): BlockInstanceLike[] {
  return blocks.map((block) => {
    if (block.type !== "custom_html") return block;
    const props = block.props as { html?: string };
    return { ...block, props: { ...props, html: sanitizeHtml(props.html ?? "") } };
  });
}

const LOCK_TTL_MS = 2 * 60 * 1000;
const ENTITY_TYPE = "page";

@Injectable()
export class PagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  async list() {
    return await this.prisma.page.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } });
  }

  async get(id: string) {
    const page = await this.prisma.page.findUnique({ where: { id } });
    if (!page || page.deletedAt) throw new NotFoundException("Page not found");
    return page;
  }

  /** Public — only ever returns a currently-published page. */
  async getPublishedBySlug(slug: string) {
    const page = await this.prisma.page.findUnique({ where: { slug } });
    if (!page || page.deletedAt || page.status !== "published" || page.blocksPublished === null) return null;
    return page;
  }

  async create(dto: CreatePageDto, actor: AuthenticatedStaff) {
    const existing = await this.prisma.page.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new BadRequestException({ code: "SLUG_TAKEN", message: `Slug "${dto.slug}" is already in use` });

    const page = await this.prisma.page.create({
      data: { slug: dto.slug, title: dto.title, blocksDraft: [], seoTitle: toJsonInput(dto.seoTitle), seoDescription: toJsonInput(dto.seoDescription) },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "page.create", entityType: ENTITY_TYPE, entityId: page.id, after: { slug: dto.slug } });
    return page;
  }

  async update(id: string, dto: UpdatePageDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    if (dto.slug && dto.slug !== before.slug) {
      if (before.isSystem) throw new BadRequestException({ code: "SYSTEM_PAGE", message: "Cannot change a system page's slug" });
      const existing = await this.prisma.page.findUnique({ where: { slug: dto.slug } });
      if (existing) throw new BadRequestException({ code: "SLUG_TAKEN", message: `Slug "${dto.slug}" is already in use` });
    }

    const page = await this.prisma.page.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.seoTitle !== undefined ? { seoTitle: toJsonInput(dto.seoTitle) } : {}),
        ...(dto.seoDescription !== undefined ? { seoDescription: toJsonInput(dto.seoDescription) } : {}),
        ...(dto.ogImageMediaId !== undefined ? { ogImageMediaId: dto.ogImageMediaId } : {}),
        ...(dto.noindex !== undefined ? { noindex: dto.noindex } : {}),
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "page.update", entityType: ENTITY_TYPE, entityId: id, before: { title: before.title }, after: { title: page.title } });
    return page;
  }

  /** Autosave target (§9.2 "autosave drafts every 10s") — always writes `blocksDraft`, never touches the live site. */
  async updateBlocks(id: string, dto: UpdatePageBlocksDto, actor: AuthenticatedStaff) {
    await this.get(id);
    const { valid, errors } = validateBlocks(dto.blocks as BlockInstanceLike[], actor.isSuperAdmin);
    if (errors.length > 0) {
      throw new BadRequestException({ code: "BLOCK_VALIDATION_ERROR", message: "One or more blocks failed validation", errors });
    }
    const sanitized = sanitizeCustomHtmlBlocks(valid);
    const page = await this.prisma.page.update({ where: { id }, data: { blocksDraft: sanitized as unknown as Prisma.InputJsonValue } });
    return page;
  }

  /** Publish now (§9.2): copies the current draft to `blocksPublished`, snapshots a version, revalidates. */
  async publish(id: string, actor: AuthenticatedStaff) {
    const page = await this.get(id);
    const updated = await this.prisma.page.update({
      where: { id },
      data: { status: "published", publishAt: null, needsContent: false, blocksPublished: page.blocksDraft as Prisma.InputJsonValue },
    });
    await this.prisma.pageVersion.create({
      data: { pageId: id, blocks: page.blocksDraft as Prisma.InputJsonValue, seoTitle: toJsonInput(page.seoTitle), seoDescription: toJsonInput(page.seoDescription), createdBy: actor.id },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "page.publish", entityType: ENTITY_TYPE, entityId: id, after: { slug: page.slug } });
    await this.revalidation.revalidate([`page:${page.slug}`, "pages"]);
    return updated;
  }

  async schedule(id: string, dto: SchedulePageDto, actor: AuthenticatedStaff) {
    const page = await this.prisma.page.update({ where: { id }, data: { status: "scheduled", publishAt: dto.publishAt } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "page.schedule", entityType: ENTITY_TYPE, entityId: id, after: { publishAt: dto.publishAt } });
    return page;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const page = await this.get(id);
    if (page.isSystem) throw new BadRequestException({ code: "SYSTEM_PAGE", message: "System pages (home, 404, 500, maintenance) cannot be deleted" });
    await this.prisma.page.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "page.delete", entityType: ENTITY_TYPE, entityId: id, before: { slug: page.slug } });
  }

  async listVersions(id: string) {
    return await this.prisma.pageVersion.findMany({ where: { pageId: id }, orderBy: { createdAt: "desc" }, take: 50 });
  }

  /** "Restore as draft" (§9.2) — never republishes by itself; the editor still has to hit Publish. */
  async restoreVersion(id: string, versionId: string, actor: AuthenticatedStaff) {
    const version = await this.prisma.pageVersion.findUnique({ where: { id: versionId } });
    if (!version || version.pageId !== id) throw new NotFoundException("Version not found");

    const page = await this.prisma.page.update({ where: { id }, data: { blocksDraft: version.blocks as Prisma.InputJsonValue } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "page.version.restore", entityType: ENTITY_TYPE, entityId: id, after: { versionId } });
    return page;
  }

  /** §9.2 edit lock: one editor at a time, expiring after inactivity rather than needing an explicit unlock. */
  async acquireLock(id: string, actor: AuthenticatedStaff) {
    const page = await this.get(id);
    const now = new Date();
    const heldByOther = page.lockedBy && page.lockedBy !== actor.id && page.lockedAt && now.getTime() - page.lockedAt.getTime() < LOCK_TTL_MS;
    if (heldByOther) {
      return { locked: true, lockedBy: page.lockedBy };
    }
    await this.prisma.page.update({ where: { id }, data: { lockedBy: actor.id, lockedAt: now } });
    return { locked: false };
  }

  async heartbeatLock(id: string, actor: AuthenticatedStaff) {
    const page = await this.get(id);
    if (page.lockedBy !== actor.id) throw new ForbiddenException({ code: "LOCK_LOST", message: "Another editor has taken over this page" });
    await this.prisma.page.update({ where: { id }, data: { lockedAt: new Date() } });
  }

  async releaseLock(id: string, actor: AuthenticatedStaff) {
    await this.prisma.page.updateMany({ where: { id, lockedBy: actor.id }, data: { lockedBy: null, lockedAt: null } });
  }

  /** Recurring sweep (SchedulerService) — publishes a `scheduled` page once its `publishAt` arrives. */
  async runScheduledPublishSweep(): Promise<void> {
    const due = await this.prisma.page.findMany({ where: { status: "scheduled", publishAt: { lte: new Date() }, deletedAt: null } });
    for (const page of due) {
      await this.prisma.page.update({ where: { id: page.id }, data: { status: "published", needsContent: false, blocksPublished: page.blocksDraft as Prisma.InputJsonValue } });
      await this.prisma.pageVersion.create({ data: { pageId: page.id, blocks: page.blocksDraft as Prisma.InputJsonValue, seoTitle: toJsonInput(page.seoTitle), seoDescription: toJsonInput(page.seoDescription) } });
      await this.audit.record({ actorType: "system", action: "page.publish", entityType: ENTITY_TYPE, entityId: page.id, after: { slug: page.slug, scheduled: true } });
      await this.revalidation.revalidate([`page:${page.slug}`, "pages"]);
    }
  }
}
