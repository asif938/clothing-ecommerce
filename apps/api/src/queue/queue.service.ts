import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PgBoss, type Job } from "pg-boss";
import type { Env } from "../config/env.schema";

/**
 * pg-boss queue (docs/PROJECT_SPEC.md §16 M1) — runs against the same
 * Postgres database, so it needs no separate infra on the free tier
 * (golden rule 8). No job handlers are registered yet in Milestone 1 (no
 * feature produces real background work before catalog/orders exist); this
 * wires the service up so `send`/`work` are ready for the milestone that
 * needs them. Connection failure is logged, not fatal — the API must keep
 * serving HTTP even if the queue backend is temporarily unreachable,
 * matching the readiness-check's own graceful-degradation behavior.
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private boss: PgBoss | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async onModuleInit(): Promise<void> {
    try {
      this.boss = new PgBoss(this.config.get("DATABASE_URL", { infer: true }));
      this.boss.on("error", (error: Error) => this.logger.error(error));
      await this.boss.start();
    } catch (error) {
      this.logger.warn(`Queue backend unavailable at startup: ${error instanceof Error ? error.message : error}`);
      this.boss = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop();
  }

  isReady(): boolean {
    return this.boss !== null;
  }

  async send(queueName: string, payload: object): Promise<void> {
    if (!this.boss) {
      this.logger.warn(`Dropped job on "${queueName}" — queue backend unavailable`);
      return;
    }
    await this.boss.send(queueName, payload);
  }

  async work<T extends object>(queueName: string, handler: (job: Job<T>) => Promise<void>): Promise<void> {
    if (!this.boss) {
      this.logger.warn(`Could not register worker for "${queueName}" — queue backend unavailable`);
      return;
    }
    await this.boss.work<T>(queueName, async (jobs: Job<T>[]) => {
      for (const job of jobs) {
        await handler(job);
      }
    });
  }
}
