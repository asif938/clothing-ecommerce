import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SearchService } from "./search.service";
import { searchQuerySchema, type SearchQueryDto } from "./dto";

/** Public storefront search (docs/PROJECT_SPEC.md §11.2 "catalog: … search, suggest"). No auth — same as the rest of `/store/*`. */
@ApiTags("store")
@Controller("store/search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQueryDto) {
    return this.searchService.search(query);
  }
}
