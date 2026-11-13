import { Module, type OnModuleInit } from "@nestjs/common";
import { SchedulerService } from "../queue/scheduler.service";
import { CustomerContextModule } from "../customer-auth/customer-context.module";
import { MediaModule } from "../media/media.module";
import { AiModule } from "../ai/ai.module";
import { StoreCatalogModule } from "../store-catalog/store-catalog.module";
import { RecommendationsService } from "./recommendations.service";
import { VisualSearchService } from "./visual-search.service";
import { PersonalizationAdminController, StorePersonalizationController } from "./personalization.controller";

/** Personalized recommendations and visual search (docs/PROJECT_SPEC.md §16 M14). */
@Module({
  imports: [CustomerContextModule, MediaModule, AiModule, StoreCatalogModule],
  controllers: [PersonalizationAdminController, StorePersonalizationController],
  providers: [RecommendationsService, VisualSearchService],
  exports: [RecommendationsService, VisualSearchService],
})
export class PersonalizationModule implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly recommendations: RecommendationsService,
    private readonly visual: VisualSearchService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("recommendations.nightly", () => this.recommendations.runIfDue());
    this.scheduler.registerRecurring("visual_search.index", () => this.visual.indexSweep().then(() => undefined));
  }
}
