import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AnnouncementsService } from "../cms/announcements.service";
import { MenusService } from "../cms/menus.service";
import { PagesService } from "../cms/pages.service";
import { PopupsService } from "../cms/popups.service";
import { RedirectsService } from "../cms/redirects.service";

/** Public CMS reads (docs/PROJECT_SPEC.md §9, §7.2) — the storefront's own data source for pages, menus, announcement bars, popups and redirects. */
@ApiTags("store")
@Controller("store")
export class StoreContentController {
  constructor(
    private readonly pages: PagesService,
    private readonly menus: MenusService,
    private readonly announcements: AnnouncementsService,
    private readonly popups: PopupsService,
    private readonly redirects: RedirectsService,
  ) {}

  @Get("pages/:slug")
  async getPage(@Param("slug") slug: string) {
    const page = await this.pages.getPublishedBySlug(slug);
    if (!page) throw new NotFoundException("Page not found");
    return page;
  }

  @Get("menus/:key")
  async getMenu(@Param("key") key: string) {
    const menu = await this.menus.getByKey(key);
    if (!menu) throw new NotFoundException("Menu not found");
    return menu;
  }

  @Get("announcements")
  listAnnouncements() {
    return this.announcements.listActiveNow();
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
}
