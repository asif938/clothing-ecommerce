import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@clothing/db";

/**
 * No eager `$connect()` in `onModuleInit`: Prisma Client connects lazily on
 * its first query by default, and the API must still boot and serve
 * `/health` when the database is temporarily unreachable (see
 * `/ready`'s own graceful-degradation behavior in HealthController) rather
 * than crash at startup.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
