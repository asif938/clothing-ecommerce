import { Module } from "@nestjs/common";
import { MediaModule } from "../media/media.module";
import { FeedsService } from "./feeds.service";
import { FeedsController } from "./feeds.controller";

@Module({
  imports: [MediaModule],
  controllers: [FeedsController],
  providers: [FeedsService],
})
export class FeedsModule {}
