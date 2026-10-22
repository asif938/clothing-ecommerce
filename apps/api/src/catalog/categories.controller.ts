import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CategoriesService } from "./categories.service";
import { createCategorySchema, updateCategorySchema, type CreateCategoryDto, type UpdateCategoryDto } from "./dto";

@ApiTags("catalog")
@Controller("admin/categories")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("catalog.manage")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list() {
    return this.categories.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.categories.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryDto, @Req() req: Request) {
    return this.categories.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryDto, @Req() req: Request) {
    return this.categories.update(id, body, req.staff!);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.categories.remove(id, req.staff!);
  }
}
