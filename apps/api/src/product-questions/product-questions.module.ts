import { Module } from "@nestjs/common";
import { CustomerContextModule } from "../customer-auth/customer-context.module";
import { ProductQuestionsService } from "./product-questions.service";
import { ProductQuestionsController } from "./product-questions.controller";
import { StoreProductQuestionsController } from "./store-product-questions.controller";

@Module({
  imports: [CustomerContextModule],
  controllers: [ProductQuestionsController, StoreProductQuestionsController],
  providers: [ProductQuestionsService],
})
export class ProductQuestionsModule {}
