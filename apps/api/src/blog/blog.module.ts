import { Module } from "@nestjs/common";
import { BlogService } from "./blog.service";
import { BlogController } from "./blog.controller";
import { StoreBlogController } from "./store-blog.controller";

@Module({ controllers: [BlogController, StoreBlogController], providers: [BlogService] })
export class BlogModule {}
