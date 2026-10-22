import { Controller, Get } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { HealthCheckService, HealthCheck, type HealthIndicatorResult } from "@nestjs/terminus";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Unprefixed by design (see main.ts) so external uptime checks and the
 * free-tier "ping to prevent spin-down" cron can hit a stable path.
 */
@ApiExcludeController()
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
  ) {}

  // Liveness: the process is up. No external dependencies checked.
  @Get("health")
  @HealthCheck()
  liveness() {
    return this.health.check([]);
  }

  // Readiness: the process can serve traffic (database reachable).
  @Get("ready")
  @HealthCheck()
  readiness() {
    return this.health.check([(): Promise<HealthIndicatorResult> => this.checkDatabase()]);
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: { status: "up" } };
    } catch (error) {
      return {
        database: {
          status: "down",
          message: error instanceof Error ? error.message : "unknown error",
        },
      };
    }
  }
}
