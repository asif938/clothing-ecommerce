import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProductsModule } from "../products/products.module";
import { MediaModule } from "../media/media.module";
import { ProvidersModule } from "../providers/providers.module";
import { AiService } from "./ai.service";
import { AiDraftsService } from "./ai-drafts.service";
import { AiAdminController, AiDraftsController } from "./ai.controller";

/** Multi-provider AI with per-feature config, budgets and usage report, plus product content drafts (docs/PROJECT_SPEC.md §10.4, §16 M13). */
@Module({
  imports: [NotificationsModule, ProductsModule, MediaModule, ProvidersModule],
  controllers: [AiAdminController, AiDraftsController],
  providers: [AiService, AiDraftsService],
  exports: [AiService],
})
export class AiModule {}
