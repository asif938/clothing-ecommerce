import { Module, type OnModuleInit } from "@nestjs/common";
import { SchedulerService } from "../queue/scheduler.service";
import { AnnouncementsController } from "./announcements.controller";
import { AnnouncementsService } from "./announcements.service";
import { MenusController } from "./menus.controller";
import { MenusService } from "./menus.service";
import { PagesController } from "./pages.controller";
import { PagesService } from "./pages.service";
import { PopupsController } from "./popups.controller";
import { PopupsService } from "./popups.service";
import { RedirectsController } from "./redirects.controller";
import { RedirectsService } from "./redirects.service";

/** CMS core (docs/PROJECT_SPEC.md §16 M3): pages, menus, announcement bars, popups, redirects. */
@Module({
  controllers: [PagesController, MenusController, AnnouncementsController, PopupsController, RedirectsController],
  providers: [PagesService, MenusService, AnnouncementsService, PopupsService, RedirectsService],
  exports: [PagesService, MenusService, AnnouncementsService, PopupsService, RedirectsService],
})
export class CmsModule implements OnModuleInit {
  constructor(
    private readonly pages: PagesService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("cms.page_publish_sweep", () => this.pages.runScheduledPublishSweep());
  }
}
