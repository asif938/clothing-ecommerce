import { Injectable } from "@nestjs/common";
import type { Prisma } from "@clothing/db";
import type { AutomationTrigger } from "@clothing/shared/automation";
import { PrismaService } from "../prisma/prisma.service";

export const AUTOMATION_TASK_TYPE = "automation.trigger";

export interface AutomationTaskPayload {
  trigger: AutomationTrigger;
  orderId: string;
}

/**
 * Transactional outbox for automation triggers (docs/PROJECT_SPEC.md §16
 * M11). Order state changes happen inside caller-owned transactions
 * (`OrdersLifecycleService.transition(…, tx)`, checkout placement), so rules
 * must not run until those commit — otherwise a rule could read a row that
 * rolls back. Instead the trigger is written as a `scheduled_tasks` row in
 * the same transaction; the scheduler tick (`AutomationModule`) picks it up
 * after commit. Kept in its own tiny module so the lifecycle/checkout
 * modules can depend on it without importing the engine (which itself needs
 * the lifecycle service).
 */
@Injectable()
export class AutomationOutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(db: Prisma.TransactionClient | PrismaService, trigger: AutomationTrigger, orderId: string): Promise<void> {
    const payload: AutomationTaskPayload = { trigger, orderId };
    await db.scheduledTask.create({ data: { type: AUTOMATION_TASK_TYPE, payload: payload as unknown as Prisma.InputJsonValue, runAt: new Date() } });
  }
}
