import { Module } from "@nestjs/common";
import { CmsModule } from "../cms/cms.module";
import { ExperimentsCoreModule } from "../experiments/experiments-core.module";
import { StoreContentController } from "./store-content.controller";

@Module({
  imports: [CmsModule, ExperimentsCoreModule],
  controllers: [StoreContentController],
})
export class StoreContentModule {}
