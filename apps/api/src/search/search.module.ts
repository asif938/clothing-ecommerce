import { Module } from "@nestjs/common";
import { SearchController } from "./search.controller";
import { SearchSynonymsController } from "./search-synonyms.controller";
import { SearchSynonymsService } from "./search-synonyms.service";
import { SearchService } from "./search.service";

/** Postgres FTS + trigram + editable Banglish synonyms (docs/PROJECT_SPEC.md §16 M2). */
@Module({
  controllers: [SearchController, SearchSynonymsController],
  providers: [SearchService, SearchSynonymsService],
  exports: [SearchService],
})
export class SearchModule {}
