import { Module } from "@nestjs/common";
import { MediaModule } from "../media/media.module";
import { CollectionsController } from "./collections.controller";
import { CollectionsService } from "./collections.service";

/** Manual + automatic collections (docs/PROJECT_SPEC.md §16 M2). */
@Module({
  imports: [MediaModule],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
