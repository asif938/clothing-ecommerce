import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { assertPublicHttpUrl } from "@clothing/shared/providers";
import {
  checkProductQuality,
  classifyLink,
  extractLinks,
  matchStorefrontRoute,
  normalizePath,
  QUALITY_ISSUES,
  scoreSeo,
  type QualityIssue,
  type SeoCheck,
} from "@clothing/shared/marketing";
import { t, type LocalizedText } from "@clothing/shared";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { blockText } from "./content-text";

const PAGE_SIZE = 50;
const EXTERNAL_TIMEOUT_MS = 8_000;
const MAX_EXTERNAL_CHECKS = 300;

export type SeoEntityType = "product" | "category" | "collection" | "page" | "blog";

interface LinkSource {
  sourceType: string;
  sourceId: string;
  sourceLabel: string;
  content: unknown;
}

function label(value: unknown): string {
  return t(value as LocalizedText | null, "en") || t(value as LocalizedText | null, "bn") || "";
}

/**
 * Content-quality tools (docs/PROJECT_SPEC.md §8.2 Catalog "Product quality
 * checker", §16 M13 "SEO score and broken link checker"). Admin-only
 * analysis — no storefront effect, so no feature toggle (same reasoning as
 * M12's admin-only tools). The scoring rules are pure functions in
 * `@clothing/shared` (unit-tested); this loads the facts.
 */
@Injectable()
export class SeoAuditService {
  private readonly logger = new Logger(SeoAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Product quality
  // ---------------------------------------------------------------------------

  async productQuality(query: { issue?: QualityIssue; status?: "active" | "draft" | "archived"; page: number }) {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null, ...(query.status ? { status: query.status } : { status: { not: "archived" } }) },
      select: {
        id: true,
        slug: true,
        status: true,
        title: true,
        description: true,
        seoTitle: true,
        seoDescription: true,
        categoryId: true,
        sizeChartId: true,
        weightGramsDefault: true,
        category: { select: { sizeChartId: true } },
        options: { select: { type: true } },
        media: { select: { alt: true } },
        variants: { where: { isActive: true }, select: { price: true, compareAtPrice: true, weightGrams: true, costPrice: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5000,
    });
    const rows = products.map((p) => {
      const result = checkProductQuality({
        title: p.title as LocalizedText,
        description: p.description as LocalizedText | null,
        seoTitle: p.seoTitle as LocalizedText | null,
        seoDescription: p.seoDescription as LocalizedText | null,
        categoryId: p.categoryId,
        imageCount: p.media.length,
        imagesMissingAlt: p.media.filter((m) => !t(m.alt as LocalizedText | null, "bn") && !t(m.alt as LocalizedText | null, "en")).length,
        hasSizeOption: p.options.some((o) => o.type === "size"),
        hasSizeChart: Boolean(p.sizeChartId ?? p.category?.sizeChartId),
        weightGramsDefault: p.weightGramsDefault,
        variants: p.variants,
      });
      return { id: p.id, slug: p.slug, status: p.status, title: p.title, ...result };
    });
    const counts = Object.fromEntries(Object.keys(QUALITY_ISSUES).map((k) => [k, rows.filter((r) => r.issues.includes(k as QualityIssue)).length])) as Record<QualityIssue, number>;
    const filtered = (query.issue ? rows.filter((r) => r.issues.includes(query.issue!)) : rows).sort((a, b) => a.score - b.score);
    const averageScore = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 100;
    return { total: filtered.length, averageScore, counts, page: query.page, pageSize: PAGE_SIZE, items: filtered.slice((query.page - 1) * PAGE_SIZE, query.page * PAGE_SIZE) };
  }

  // ---------------------------------------------------------------------------
  // SEO score
  // ---------------------------------------------------------------------------

  async seoScores(type: SeoEntityType, page: number, check?: SeoCheck) {
    let rows: { id: string; label: string; slug: string; link: string; score: number; issues: ReturnType<typeof scoreSeo>["issues"] }[];
    if (type === "product") {
      const items = await this.prisma.product.findMany({ where: { deletedAt: null, status: "active" }, select: { id: true, slug: true, title: true, description: true, seoTitle: true, seoDescription: true, media: { select: { alt: true } } }, take: 5000 });
      rows = items.map((p) => ({
        id: p.id,
        label: label(p.title),
        slug: p.slug,
        link: `/products/${p.id}`,
        ...scoreSeo({ title: p.title as LocalizedText, seoTitle: p.seoTitle as LocalizedText | null, seoDescription: p.seoDescription as LocalizedText | null, slug: p.slug, body: p.description as LocalizedText | null, minBodyChars: 150, imageCount: p.media.length, imagesWithAlt: p.media.filter((m) => label(m.alt)).length }),
      }));
    } else if (type === "category" || type === "collection") {
      const items =
        type === "category"
          ? await this.prisma.category.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, slug: true, name: true, description: true, seoTitle: true, seoDescription: true }, take: 2000 })
          : await this.prisma.collection.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, slug: true, name: true, description: true, seoTitle: true, seoDescription: true }, take: 2000 });
      rows = items.map((c) => ({
        id: c.id,
        label: label(c.name),
        slug: c.slug,
        link: type === "category" ? `/catalog` : `/collections/${c.id}`,
        ...scoreSeo({ title: c.name as LocalizedText, seoTitle: c.seoTitle as LocalizedText | null, seoDescription: c.seoDescription as LocalizedText | null, slug: c.slug, body: c.description as LocalizedText | null, minBodyChars: 100, imageCount: 0, imagesWithAlt: 0 }),
      }));
    } else if (type === "page") {
      const items = await this.prisma.page.findMany({ where: { deletedAt: null, status: "published" }, select: { id: true, slug: true, title: true, seoTitle: true, seoDescription: true, blocksPublished: true, noindex: true }, take: 2000 });
      rows = items.map((p) => ({
        id: p.id,
        label: p.title,
        slug: p.slug,
        link: `/cms/pages/${p.id}`,
        ...scoreSeo({ title: { bn: p.title, en: p.title }, seoTitle: p.seoTitle as LocalizedText | null, seoDescription: p.seoDescription as LocalizedText | null, slug: p.slug, body: blockText(p.blocksPublished), minBodyChars: 300, imageCount: 0, imagesWithAlt: 0, noindex: p.noindex }),
      }));
    } else {
      const items = await this.prisma.blogPost.findMany({ where: { deletedAt: null, status: "published" }, select: { id: true, slug: true, title: true, seoTitle: true, seoDescription: true, blocksPublished: true }, take: 2000 });
      rows = items.map((b) => ({
        id: b.id,
        label: label(b.title),
        slug: b.slug,
        link: `/blog/${b.id}`,
        ...scoreSeo({ title: b.title as LocalizedText, seoTitle: b.seoTitle as LocalizedText | null, seoDescription: b.seoDescription as LocalizedText | null, slug: b.slug, body: blockText(b.blocksPublished), minBodyChars: 300, imageCount: 0, imagesWithAlt: 0 }),
      }));
    }
    const filtered = (check ? rows.filter((r) => r.issues.some((i) => i.check === check)) : rows).sort((a, b) => a.score - b.score);
    const averageScore = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 100;
    return { type, total: filtered.length, averageScore, page, pageSize: PAGE_SIZE, items: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
  }

  // ---------------------------------------------------------------------------
  // Broken links
  // ---------------------------------------------------------------------------

  listScans() {
    return this.prisma.linkScan.findMany({ orderBy: { startedAt: "desc" }, take: 20 });
  }

  async getScan(id: string) {
    const scan = await this.prisma.linkScan.findUnique({ where: { id }, include: { results: { orderBy: [{ sourceType: "asc" }, { sourceLabel: "asc" }] } } });
    if (!scan) throw new NotFoundException({ code: "SCAN_NOT_FOUND", message: "Scan not found" });
    return scan;
  }

  /** Starts a scan in the background and returns it; the admin polls `getScan`. A scan still "running" after an hour is reported failed (the process died). */
  async startScan(actor: AuthenticatedStaff) {
    await this.prisma.linkScan.updateMany({ where: { status: "running", startedAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } }, data: { status: "failed", error: "Interrupted", finishedAt: new Date() } });
    const running = await this.prisma.linkScan.findFirst({ where: { status: "running" } });
    if (running) return running;
    const scan = await this.prisma.linkScan.create({ data: { createdBy: actor.id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "link_scan.start", entityType: "link_scan", entityId: scan.id });
    void this.runScan(scan.id);
    return scan;
  }

  private async sources(): Promise<LinkSource[]> {
    const [pages, posts, menus, bars, popups, products, categories] = await Promise.all([
      this.prisma.page.findMany({ where: { deletedAt: null, status: "published" }, select: { id: true, title: true, blocksPublished: true } }),
      this.prisma.blogPost.findMany({ where: { deletedAt: null, status: "published" }, select: { id: true, title: true, blocksPublished: true } }),
      this.prisma.menu.findMany({ select: { id: true, name: true, items: true } }),
      this.prisma.announcementBar.findMany({ where: { isActive: true }, select: { id: true, message: true, linkUrl: true } }),
      this.prisma.popup.findMany({ where: { isActive: true }, select: { id: true, name: true, ctaUrl: true } }),
      this.prisma.product.findMany({ where: { deletedAt: null, status: "active" }, select: { id: true, title: true, description: true, shortDescription: true } }),
      this.prisma.category.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, name: true, description: true } }),
    ]);
    return [
      ...pages.map((p) => ({ sourceType: "page", sourceId: p.id, sourceLabel: p.title, content: p.blocksPublished })),
      ...posts.map((p) => ({ sourceType: "blog", sourceId: p.id, sourceLabel: label(p.title), content: p.blocksPublished })),
      ...menus.map((m) => ({ sourceType: "menu", sourceId: m.id, sourceLabel: m.name, content: m.items })),
      ...bars.map((b) => ({ sourceType: "announcement", sourceId: b.id, sourceLabel: label(b.message), content: { linkUrl: b.linkUrl } })),
      ...popups.map((p) => ({ sourceType: "popup", sourceId: p.id, sourceLabel: p.name, content: { ctaUrl: p.ctaUrl } })),
      ...products.map((p) => ({ sourceType: "product", sourceId: p.id, sourceLabel: label(p.title), content: [p.description, p.shortDescription] })),
      ...categories.map((c) => ({ sourceType: "category", sourceId: c.id, sourceLabel: label(c.name), content: c.description })),
    ];
  }

  /** Why an internal path wouldn't render, or null when it's fine. Follows one active redirect. */
  async internalProblem(path: string, depth = 0): Promise<string | null> {
    const route = matchStorefrontRoute(path);
    switch (route.type) {
      case "home":
      case "static":
        return null;
      case "product": {
        const p = await this.prisma.product.findUnique({ where: { slug: route.slug }, select: { status: true, deletedAt: true } });
        return !p || p.deletedAt ? "product_not_found" : p.status !== "active" ? "product_not_active" : null;
      }
      case "category": {
        const c = await this.prisma.category.findUnique({ where: { slug: route.slugs.at(-1)! }, select: { isActive: true, deletedAt: true } });
        return !c || c.deletedAt ? "category_not_found" : !c.isActive ? "category_inactive" : null;
      }
      case "collection": {
        const c = await this.prisma.collection.findUnique({ where: { slug: route.slug }, select: { isActive: true, deletedAt: true } });
        return !c || c.deletedAt ? "collection_not_found" : !c.isActive ? "collection_inactive" : null;
      }
      case "page": {
        const p = await this.prisma.page.findUnique({ where: { slug: route.slug }, select: { status: true, deletedAt: true } });
        return !p || p.deletedAt ? "page_not_found" : p.status !== "published" ? "page_not_published" : null;
      }
      case "blog_post": {
        const b = await this.prisma.blogPost.findUnique({ where: { slug: route.slug }, select: { status: true, deletedAt: true } });
        return !b || b.deletedAt ? "blog_post_not_found" : b.status !== "published" ? "blog_post_not_published" : null;
      }
      case "unknown": {
        const bare = normalizePath(path.replace(/^\/(en|bn)(?=\/|$)/, "") || "/");
        const redirect = await this.prisma.redirect.findFirst({ where: { isActive: true, fromPath: { in: [normalizePath(path), bare] } } });
        if (!redirect) return "no_such_route";
        if (depth > 0) return "redirect_chain";
        const target = classifyLink(redirect.toPath, this.ownOrigins());
        return target.kind === "internal" ? this.internalProblem(target.path, depth + 1) : null;
      }
    }
  }

  private ownOrigins(): string[] {
    return [process.env.STOREFRONT_URL].filter((v): v is string => Boolean(v));
  }

  async externalProblem(url: string): Promise<{ reason: string; httpStatus: number | null } | null> {
    try {
      await assertPublicHttpUrl(url);
    } catch {
      return { reason: "blocked_address", httpStatus: null };
    }
    try {
      let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS) });
      if (response.status === 405 || response.status === 403) response = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS) });
      return response.status >= 400 ? { reason: "http_error", httpStatus: response.status } : null;
    } catch {
      return { reason: "unreachable", httpStatus: null };
    }
  }

  async runScan(scanId: string): Promise<void> {
    try {
      const checkExternal = await this.settings.getValue<boolean>("seo.brokenLinks.checkExternal");
      const origins = this.ownOrigins();
      const internalCache = new Map<string, string | null>();
      const externalCache = new Map<string, { reason: string; httpStatus: number | null } | null>();
      const results: { sourceType: string; sourceId: string; sourceLabel: string; url: string; kind: string; reason: string; httpStatus: number | null }[] = [];
      let checked = 0;
      for (const source of await this.sources()) {
        for (const raw of extractLinks(source.content)) {
          const link = classifyLink(raw, origins);
          if (link.kind === "skip") continue;
          checked += 1;
          if (link.kind === "internal") {
            if (!internalCache.has(link.path)) internalCache.set(link.path, await this.internalProblem(link.path));
            const reason = internalCache.get(link.path);
            if (reason) results.push({ sourceType: source.sourceType, sourceId: source.sourceId, sourceLabel: source.sourceLabel, url: raw, kind: "internal", reason, httpStatus: null });
          } else if (checkExternal) {
            if (!externalCache.has(link.url)) externalCache.set(link.url, externalCache.size < MAX_EXTERNAL_CHECKS ? await this.externalProblem(link.url) : null);
            const problem = externalCache.get(link.url);
            if (problem) results.push({ sourceType: source.sourceType, sourceId: source.sourceId, sourceLabel: source.sourceLabel, url: raw, kind: "external", ...problem });
          }
        }
      }
      await this.prisma.$transaction([
        this.prisma.linkScanResult.createMany({ data: results.map((r) => ({ scanId, sourceType: r.sourceType, sourceId: r.sourceId, sourceLabel: r.sourceLabel.slice(0, 200), url: r.url.slice(0, 2000), kind: r.kind, reason: r.reason, httpStatus: r.httpStatus })) }),
        this.prisma.linkScan.update({ where: { id: scanId }, data: { status: "completed", linksChecked: checked, brokenCount: results.length, finishedAt: new Date() } }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Link scan ${scanId} failed: ${message}`);
      await this.prisma.linkScan.update({ where: { id: scanId }, data: { status: "failed", error: message, finishedAt: new Date() } });
    }
  }
}
