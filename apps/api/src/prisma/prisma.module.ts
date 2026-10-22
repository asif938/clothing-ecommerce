import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/** @Global: every feature module needs Prisma; re-importing it everywhere would be pure noise. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
