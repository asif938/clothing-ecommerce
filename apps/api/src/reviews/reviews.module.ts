import { Module, type OnModuleInit } from "@nestjs/common";
import { CustomerContextModule } from "../customer-auth/customer-context.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { SchedulerService } from "../queue/scheduler.service";
import { ReviewsService } from "./reviews.service";
import { StoreReviewsService } from "./store-reviews.service";
import { ReviewRequestService } from "./review-request.service";
import { ReviewsController } from "./reviews.controller";
import { StoreReviewsController } from "./store-reviews.controller";

@Module({
  imports: [CustomerContextModule, NotificationsModule],
  controllers: [ReviewsController, StoreReviewsController],
  providers: [ReviewsService, StoreReviewsService, ReviewRequestService],
  exports: [ReviewsService, StoreReviewsService],
})
export class ReviewsModule implements OnModuleInit {
  constructor(
    private readonly reviewRequests: ReviewRequestService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("reviews.request_sweep", () => this.reviewRequests.sweep().then(() => undefined));
  }
}
