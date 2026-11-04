import { Module } from "@nestjs/common";
import { CustomerContextModule } from "../customer-auth/customer-context.module";
import { ReviewsService } from "./reviews.service";
import { StoreReviewsService } from "./store-reviews.service";
import { ReviewsController } from "./reviews.controller";
import { StoreReviewsController } from "./store-reviews.controller";

@Module({
  imports: [CustomerContextModule],
  controllers: [ReviewsController, StoreReviewsController],
  providers: [ReviewsService, StoreReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
