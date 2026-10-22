import { Controller, ForbiddenException, Headers, Param, Post } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.schema";
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
  ) {}

  @Post(":task")
  async run(@Param("task") _task: string, @Headers("x-cron-secret") providedSecret: string | undefined) {
    const expected = this.config.get("CRON_SECRET", { infer: true });
    if (!expected || providedSecret !== expected) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Invalid cron secret" });
    }
    return await this.scheduler.runDueTasks();
  }
}
