import { Module } from "@nestjs/common";
import { SizeRecommenderService } from "./size-recommender.service";
import { StoreMeasurementsController, StoreSizeRecommenderController } from "./size-recommender.controller";

@Module({
  controllers: [StoreMeasurementsController, StoreSizeRecommenderController],
  providers: [SizeRecommenderService],
  exports: [SizeRecommenderService],
})
export class SizeRecommenderModule {}
