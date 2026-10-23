import { Module } from "@nestjs/common";
import { CmsModule } from "../cms/cms.module";
import { StoreContentController } from "./store-content.controller";

@Module({
  imports: [CmsModule],
  controllers: [StoreContentController],
})
export class StoreContentModule {}
