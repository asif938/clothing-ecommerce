import { Module } from "@nestjs/common";
import { MediaModule } from "../media/media.module";
import { SearchModule } from "../search/search.module";
import { StoreCatalogController } from "./store-catalog.controller";
import { StoreCatalogService } from "./store-catalog.service";

@Module({
  imports: [MediaModule, SearchModule],
  controllers: [StoreCatalogController],
  providers: [StoreCatalogService],
  exports: [StoreCatalogService],
})
export class StoreCatalogModule {}
