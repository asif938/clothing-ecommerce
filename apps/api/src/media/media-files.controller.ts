import { Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { MediaService } from "./media.service";

/**
 * Serves locally-stored media files (`STORAGE_DRIVER=local`). Unprefixed and
 * unauthenticated by design — a local `publicUrl()` must resolve the same
 * way an S3/R2 bucket's public URL would (docs/PROJECT_SPEC.md §4.3): no
 * auth, since uploaded media (product photos, logos) isn't sensitive.
 */
@ApiExcludeController()
@Controller("media")
export class MediaFilesController {
  constructor(
    private readonly media: MediaService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("*path")
  async serve(@Param("path") pathSegments: string[], @Res() res: Response) {
    const storageKey = pathSegments.join("/");
    const exists = await this.prisma.media.findFirst({ where: { storageKey }, select: { mimeType: true } });
    const variantMime = storageKey.endsWith(".webp") ? "image/webp" : exists?.mimeType;
    if (!variantMime) {
      throw new NotFoundException("File not found");
    }

    try {
      const bytes = await this.media.getFileForServing(storageKey);
      res.setHeader("Content-Type", variantMime);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.send(Buffer.from(bytes));
    } catch {
      throw new NotFoundException("File not found");
    }
  }
}
