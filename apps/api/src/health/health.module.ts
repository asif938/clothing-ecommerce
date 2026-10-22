import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { PrismaClient } from "@clothing/db";
import { HealthController } from "./health.controller";
import { PRISMA_CLIENT } from "./prisma-client.token";

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [{ provide: PRISMA_CLIENT, useValue: new PrismaClient() }],
})
export class HealthModule {}
