import { Module } from "@nestjs/common";
import { ProvidersModule } from "../providers/providers.module";
import { MediaController } from "./media.controller";
import { MediaFilesController } from "./media-files.controller";
import { MediaFoldersController } from "./media-folders.controller";
import { MediaMigrationController } from "./media-migration.controller";
import { MediaMigrationService } from "./media-migration.service";
import { MediaProvidersService } from "./media-providers.service";
import { MediaUsageService } from "./media-usage.service";
import { MediaService } from "./media.service";

@Module({
  imports: [ProvidersModule],
  controllers: [MediaController, MediaFoldersController, MediaFilesController, MediaMigrationController],
  providers: [MediaService, MediaProvidersService, MediaMigrationService, MediaUsageService],
  // MediaService is exported for the catalog importer's ZIP/URL image import (§8.2).
  exports: [MediaProvidersService, MediaUsageService, MediaService],
})
export class MediaModule {}
