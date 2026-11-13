import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";
import { AnnouncementsService } from "../cms/announcements.service";
import { MenusService } from "../cms/menus.service";
import { PagesService } from "../cms/pages.service";
import { PopupsService } from "../cms/popups.service";
import { RedirectsService } from "../cms/redirects.service";
import { ExperimentAssignmentsService } from "../experiments/experiment-assignments.service";

/** Public CMS reads (docs/PROJECT_SPEC.md §9, §7.2) — the storefront's own data source for pages, menus, announcement bars, popups and redirects. */
@ApiTags("store")
@Controller("store")
export class StoreContentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pages: PagesService,
    private readonly menus: MenusService,
    private readonly announcements: AnnouncementsService,
    private readonly popups: PopupsService,
    private readonly redirects: RedirectsService,
    private readonly experiments: ExperimentAssignmentsService,
  ) {}

  @Get("pages/:slug")
  async getPage(@Param("slug") slug: string) {
    const page = await this.pages.getPublishedBySlug(slug);
    if (!page) throw new NotFoundException("Page not found");
    // §9.1 `variants` / §16 M14 — a block under a running A/B test carries every variant so each can be server-rendered; the browser shows the visitor's one.
    const attachments = await this.experiments.blockExperimentsForPage(page.id);
    if (attachments.size === 0 || !Array.isArray(page.blocksPublished)) return page;
    const blocks = (page.blocksPublished as { id?: string }[]).map((block) => {
      const experiment = block.id ? attachments.get(block.id) : undefined;
      return experiment ? { ...block, experiment } : block;
    });
    return { ...page, blocksPublished: blocks };
  }

  @Get("menus/:key")
  async getMenu(@Param("key") key: string) {
    const menu = await this.menus.getByKey(key);
    if (!menu) throw new NotFoundException("Menu not found");
    return menu;
  }

  @Get("announcements")
  async listAnnouncements() {
    const [bars, attachments] = await Promise.all([this.announcements.listActiveNow(), this.experiments.announcementExperiments()]);
    return bars.map((bar) => {
      const experiment = attachments.get(bar.id);
      return experiment ? { ...bar, experiment } : bar;
    });
  }

  @Get("popups")
  listPopups() {
    return this.popups.listActiveNow();
  }

  @Get("redirects/lookup")
  async lookupRedirect(@Query("path") path: string) {
    const redirect = await this.redirects.findActiveByFromPath(path);
    return redirect ?? { found: false };
  }

  /** Index split by type (docs/PROJECT_SPEC.md §13.2 "sitemap.xml index split by type") — the storefront's `app/sitemap.ts` reads this one aggregated list rather than needing 4 separate round trips. */
  @Get("sitemap")
  async getSitemap() {
    const [pages, products, categories, collections] = await Promise.all([
      this.prisma.page.findMany({ where: { status: "published", deletedAt: null, noindex: false }, select: { slug: true, updatedAt: true } }),
      this.prisma.product.findMany({ where: { status: "active", deletedAt: null }, select: { slug: true, updatedAt: true } }),
      this.prisma.category.findMany({ where: { isActive: true, deletedAt: null }, select: { slug: true, updatedAt: true } }),
      this.prisma.collection.findMany({ where: { isActive: true, deletedAt: null }, select: { slug: true, updatedAt: true } }),
    ]);
    return { pages, products, categories, collections };
  }
}
