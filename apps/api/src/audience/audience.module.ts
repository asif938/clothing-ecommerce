import { Module } from "@nestjs/common";
import { CustomersModule } from "../customers/customers.module";
import { AudienceController } from "./audience.controller";

@Module({ imports: [CustomersModule], controllers: [AudienceController] })
export class AudienceModule {}
