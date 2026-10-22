import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SearchSynonymsService } from "./search-synonyms.service";
import { createSearchSynonymSchema, updateSearchSynonymSchema, type CreateSearchSynonymDto, type UpdateSearchSynonymDto } from "./dto";

@ApiTags("search")
@Controller("admin/search/synonyms")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("search.manage")
export class SearchSynonymsController {
  constructor(private readonly synonyms: SearchSynonymsService) {}

  @Get()
  list() {
    return this.synonyms.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createSearchSynonymSchema)) body: CreateSearchSynonymDto, @Req() req: Request) {
    return this.synonyms.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateSearchSynonymSchema)) body: UpdateSearchSynonymDto, @Req() req: Request) {
    return this.synonyms.update(id, body, req.staff!);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.synonyms.remove(id, req.staff!);
  }
}
