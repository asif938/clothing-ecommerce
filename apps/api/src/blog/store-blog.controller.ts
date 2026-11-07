import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BlogService } from "./blog.service";
import { listBlogPostsQuerySchema, type ListBlogPostsQueryDto } from "./dto";

@ApiTags("store")
@Controller("store/blog-posts")
export class StoreBlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listBlogPostsQuerySchema)) query: ListBlogPostsQueryDto) {
    return this.blog.listPublished(query);
  }

  @Get(":slug")
  async bySlug(@Param("slug") slug: string) {
    const post = await this.blog.getPublishedBySlug(slug);
    if (!post) throw new NotFoundException("Post not found");
    return post;
  }
}
