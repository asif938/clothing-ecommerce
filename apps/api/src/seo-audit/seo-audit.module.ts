import { Module } from "@nestjs/common";
import { SeoAuditService } from "./seo-audit.service";
import { ProductQualityController, SeoAuditController } from "./seo-audit.controller";

/** Product quality checker, SEO scores and the broken link checker (docs/PROJECT_SPEC.md §8.2, §16 M13). */
@Module({
  controllers: [ProductQualityController, SeoAuditController],
  providers: [SeoAuditService],
})
export class SeoAuditModule {}
