import { Module, type OnModuleInit } from "@nestjs/common";
import { SchedulerService } from "../queue/scheduler.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { CustomersModule } from "../customers/customers.module";
import { LoyaltyModule } from "../loyalty/loyalty.module";
import { ProvidersModule } from "../providers/providers.module";
import { MarketingMessagingService } from "./marketing-messaging.service";
import { JourneysService } from "./journeys.service";
import { BroadcastsService } from "./broadcasts.service";
import { AudienceSyncService } from "./audience-sync.service";
import { AdSpendService } from "./ad-spend.service";
import { PromoCalendarService } from "./promo-calendar.service";
import { AdSpendController, AudiencesController, BroadcastsController, JourneysController, PromoCalendarController } from "./marketing.controller";

/**
 * Marketing automation (docs/PROJECT_SPEC.md §8.2 Marketing, §16 M13):
 * journeys, broadcasts (incl. unique-code campaigns), ad-audience sync, ad
 * spend + ROAS, promo calendar. Messages go out through M7's notification
 * pipeline.
 */
@Module({
  imports: [NotificationsModule, CustomersModule, LoyaltyModule, ProvidersModule],
  controllers: [JourneysController, BroadcastsController, AudiencesController, AdSpendController, PromoCalendarController],
  providers: [MarketingMessagingService, JourneysService, BroadcastsService, AudienceSyncService, AdSpendService, PromoCalendarService],
  exports: [AdSpendService],
})
export class MarketingModule implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly journeys: JourneysService,
    private readonly broadcasts: BroadcastsService,
    private readonly audiences: AudienceSyncService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("marketing.journeys_enroll", () => this.journeys.enrollSweep().then(() => undefined));
    this.scheduler.registerRecurring("marketing.journeys_run", () => this.journeys.runDue().then(() => undefined));
    this.scheduler.registerRecurring("marketing.broadcasts", () => this.broadcasts.processSweep().then(() => undefined));
    this.scheduler.registerRecurring("marketing.audience_autosync", () => this.audiences.autoSyncSweep());
  }
}
