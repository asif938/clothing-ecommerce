import { Module, type OnModuleInit } from "@nestjs/common";
import { SchedulerService } from "../queue/scheduler.service";
import { CustomerContextModule } from "../customer-auth/customer-context.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProvidersModule } from "../providers/providers.module";
import { AiModule } from "../ai/ai.module";
import { SearchModule } from "../search/search.module";
import { StoreCatalogModule } from "../store-catalog/store-catalog.module";
import { SizeRecommenderModule } from "../size-recommender/size-recommender.module";
import { ChannelsService } from "./channels.service";
import { InboxService } from "./inbox.service";
import { InboxWebhooksService } from "./inbox-webhooks.service";
import { AssistantService } from "./assistant.service";
import { AssistantToolsService } from "./assistant-tools.service";
import { TicketsService } from "./tickets.service";
import { CannedRepliesService } from "./canned-replies.service";
import { TelephonyService } from "./telephony.service";
import { CallsController, CannedRepliesController, ConversationsController, StoreLiveChatController, SupportWebhooksController, TicketsController } from "./support.controller";

/** Support: unified inbox, live chat, AI assistant, tickets with SLA, canned replies, click-to-call (docs/PROJECT_SPEC.md §16 M15). */
@Module({
  imports: [CustomerContextModule, NotificationsModule, ProvidersModule, AiModule, SearchModule, StoreCatalogModule, SizeRecommenderModule],
  controllers: [ConversationsController, TicketsController, CannedRepliesController, CallsController, SupportWebhooksController, StoreLiveChatController],
  providers: [ChannelsService, InboxService, InboxWebhooksService, AssistantService, AssistantToolsService, TicketsService, CannedRepliesService, TelephonyService],
  exports: [InboxService, TelephonyService],
})
export class SupportModule implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly assistant: AssistantService,
    private readonly tickets: TicketsService,
    private readonly webhooks: InboxWebhooksService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("support.assistant_pending", () => this.assistant.sweep().then(() => undefined));
    this.scheduler.registerRecurring("support.ticket_sla", () => this.tickets.slaSweep().then(() => undefined));
    this.scheduler.registerRecurring("support.webhook_retry", () => this.webhooks.retrySweep().then(() => undefined));
  }
}
