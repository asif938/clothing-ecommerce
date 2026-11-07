import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BlogService } from "./blog.service";
import { createBlogPostSchema, updateBlogPostBlocksSchema, updateBlogPostSchema, type CreateBlogPostDto, type UpdateBlogPostBlocksDto, type UpdateBlogPostDto } from "./dto";

@ApiTags("blog")
@Controller("admin/blog-posts")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("blog.manage")
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  list() {
    return this.blog.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.blog.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createBlogPostSchema)) body: CreateBlogPostDto, @Req() req: Request) {
    return this.blog.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateBlogPostSchema)) body: UpdateBlogPostDto, @Req() req: Request) {
    return this.blog.update(id, body, req.staff!);
  }

  @Patch(":id/blocks")
  updateBlocks(@Param("id") id: string, @Body(new ZodValidationPipe(updateBlogPostBlocksSchema)) body: UpdateBlogPostBlocksDto, @Req() req: Request) {
    return this.blog.updateBlocks(id, body, req.staff!);
  }

  @Post(":id/publish")
  publish(@Param("id") id: string, @Req() req: Request) {
    return this.blog.publish(id, req.staff!);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.blog.remove(id, req.staff!);
  }
}
