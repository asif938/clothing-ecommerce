import { Module } from "@nestjs/common";
import { OrderQueueController } from "./order-queue.controller";
import { OrderQueueService } from "./order-queue.service";

@Module({ controllers: [OrderQueueController], providers: [OrderQueueService], exports: [OrderQueueService] })
export class OrderQueueModule {}
