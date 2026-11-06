import { Controller, ForbiddenException, Headers, Param, Post } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.schema";
import { PrismaService } from "../prisma/prisma.service";
import { SchedulerService } from "./scheduler.service";

/**
 * `POST /public/cron/:task` (docs/PROJECT_SPEC.md §15.5 `CRON_SECRET`) —
 * for free-tier hosts that spin processes down when idle and so can't run
 * `SchedulerService`'s embedded `setInterval`: an external cron pinger
 * (e.g. cron-job.org) hits this instead. `:task` is accepted but ignored in
 * Milestone 1 (there's only the one tick); kept in the path so a later
 * milestone can route to different jobs without a breaking URL change.
 */
@ApiExcludeController()
@Controller("public/cron")
export class CronController {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * §15.4 "Daily logical DB backup ... free mode via GitHub Actions
   * workflow" (.github/workflows/backup.yml) — called after a successful
   * `pg_dump` + upload, so the launch checklist's "backups running" item
   * (apps/api/src/launch-checklist/) has something real to check instead
   * of just trusting the workflow exists and hoping it's green. Registered
   * before `:task` — Nest/Express match routes in registration order, and
   * `:task` would otherwise swallow this specific path too.
   */
  @Post("backup-heartbeat")
  async backupHeartbeat(@Headers("x-cron-secret") providedSecret: string | undefined) {
    this.assertSecret(providedSecret);
    await this.prisma.setting.upsert({
      where: { key: "ops.lastBackupAt" },
      update: { value: new Date().toISOString() },
      create: { key: "ops.lastBackupAt", value: new Date().toISOString() },
    });
    return { ok: true };
  }

  @Post(":task")
  async run(@Param("task") _task: string, @Headers("x-cron-secret") providedSecret: string | undefined) {
    this.assertSecret(providedSecret);
    return await this.scheduler.runDueTasks();
  }

  private assertSecret(providedSecret: string | undefined): void {
    const expected = this.config.get("CRON_SECRET", { infer: true });
    if (!expected || providedSecret !== expected) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Invalid cron secret" });
    }
  }
}
