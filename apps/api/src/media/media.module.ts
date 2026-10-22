import { Module } from "@nestjs/common";
import { MediaController } from "./media.controller";
import { MediaFilesController } from "./media-files.controller";
import { MediaFoldersController } from "./media-folders.controller";
import { MediaService } from "./media.service";

@Module({
  controllers: [MediaController, MediaFoldersController, MediaFilesController],
  providers: [MediaService],
})
export class MediaModule {}
