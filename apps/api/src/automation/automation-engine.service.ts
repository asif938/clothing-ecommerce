import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@clothing/db";
import { formatTakaFromPoisha } from "@clothing/shared/notifications";
import { conditionGroupSchema, evaluateConditions, type ConditionContext } from "@clothing/shared/automation";
import { automationActionSchema, type AutomationAction, type AutomationTrigger } from "@clothing/shared/automation";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { OrdersLifecycleService } from "../checkout/orders-lifecycle.service";
import { NotificationsService } from "../notifications/notifications.service";
import { StaffNotificationsService } from "../notifications/staff-notifications.service";
import { OrderContextService, type OrderWithCustomer } from "./order-context.service";
import { OrderQueueService } from "../order-queue/order-queue.service";
import { OrderConfirmationService } from "../order-confirmation/order-confirmation.service";
import type { AutomationTaskPayload } from "./automation-outbox.service";
import { postJsonSafely } from "./safe-fetch";

/** A rule that has already fired this many times for one order within the window is skipped — stops two rules from flipping an order back and forth forever. */
const LOOP_GUARD_MAX_RUNS = 3;
const LOOP_GUARD_WINDOW_MS = 60 * 60_000;

type OrderForAutomation = OrderWithCustomer;

/**
 * The automation rule engine (docs/PROJECT_SPEC.md §5.10, §16 M11): given a
 * trigger and an order, runs every active matching rule in priority order,
 * records an `automation_runs` row per matched rule, and stops early when a
 * rule says `stopProcessing`. Triggers arrive through the transactional
 * outbox (`AutomationOutboxService`), so by the time this runs the
 * originating change has committed.
 */
@Injectable()
export class AutomationEngineService {
  private readonly logger = new Logger(AutomationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly lifecycle: OrdersLifecycleService,
    private readonly notifications: NotificationsService,
    private readonly staffNotifications: StaffNotificationsService,
    private readonly orderContext: OrderContextService,
    private readonly queue: OrderQueueService,
    private readonly confirmation: OrderConfirmationService,
  ) {}

  /** Entry point the scheduler calls for an `automation.trigger` task. */
  async handle(payload: unknown): Promise<void> {
    const { trigger, orderId } = payload as AutomationTaskPayload;
    if (trigger === "order.placed") await this.runPlacementBuiltins(orderId);
    await this.runRules(trigger, orderId);
  }

  /** Built-in, setting-driven reactions to a new order that predate any user-authored rule: queue auto-assignment and the self-confirmation request. */
  private async runPlacementBuiltins(orderId: string): Promise<void> {
    try {
      if (await this.settings.getValue<boolean>("orders.queue.autoAssign")) await this.queue.autoAssign(orderId, "placement");
    } catch (error) {
      this.logger.error(`Auto-assign failed for order ${orderId}: ${errorMessage(error)}`);
    }
    try {
      if (await this.settings.getValue<boolean>("orders.selfConfirm.enabled")) await this.confirmation.request(orderId);
    } catch (error) {
      this.logger.error(`Confirmation request failed for order ${orderId}: ${errorMessage(error)}`);
    }
  }

  async buildContextForOrder(orderId: string): Promise<{ order: OrderWithCustomer; context: ConditionContext } | null> {
    return await this.orderContext.forOrder(orderId);
  }

  async runRules(trigger: AutomationTrigger, orderId: string): Promise<{ matched: number }> {
    const rules = await this.prisma.automationRule.findMany({ where: { trigger, isActive: true }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
    let matched = 0;
    for (const rule of rules) {
      // Re-read each time: an earlier rule's actions may have changed the order.
      const loaded = await this.buildContextForOrder(orderId);
      if (!loaded) return { matched };

      const conditions = conditionGroupSchema.safeParse(rule.conditions);
      if (!conditions.success || !evaluateConditions(conditions.data, loaded.context)) continue;

      const recent = await this.prisma.automationRun.count({ where: { ruleId: rule.id, entityId: orderId, createdAt: { gte: new Date(Date.now() - LOOP_GUARD_WINDOW_MS) } } });
      if (recent >= LOOP_GUARD_MAX_RUNS) {
        await this.prisma.automationRun.create({ data: { ruleId: rule.id, trigger, entityId: orderId, payload: toJson({ orderId }), status: "skipped", error: "Loop guard: rule already ran too many times for this order" } });
        continue;
      }

      matched += 1;
      const results: string[] = [];
      let error: string | null = null;
      for (const raw of Array.isArray(rule.actions) ? rule.actions : []) {
        const action = automationActionSchema.safeParse(raw);
        if (!action.success) {
          error = "Invalid action definition";
          break;
        }
        try {
          results.push(await this.runAction(action.data, loaded.order, rule.name));
        } catch (actionError) {
          error = `${action.data.type}: ${errorMessage(actionError)}`;
          break;
        }
      }
      await this.prisma.automationRun.create({
        data: { ruleId: rule.id, trigger, entityId: orderId, payload: toJson({ orderId, context: loaded.context }), status: error ? "failed" : "matched", result: toJson(results), error },
      });
      await this.prisma.automationRule.update({ where: { id: rule.id }, data: { runCount: { increment: 1 } } });
      await this.prisma.orderEvent.create({ data: { orderId, type: "automation", data: { ruleId: rule.id, rule: rule.name, results, error }, actor: { type: "system" } } });
      if (rule.stopProcessing && !error) break;
    }
    return { matched };
  }

  /** Executes one action; returns a short human-readable result for the run log. */
  async runAction(action: AutomationAction, order: OrderForAutomation, ruleName: string): Promise<string> {
    switch (action.type) {
      case "add_tag":
      case "remove_tag": {
        const adding = action.type === "add_tag";
        if (action.target === "customer") {
          if (!order.customerId || !order.customer) return "skipped: order has no customer";
          const tags = adding ? [...new Set([...order.customer.tags, action.tag])] : order.customer.tags.filter((t) => t !== action.tag);
          await this.prisma.customer.update({ where: { id: order.customerId }, data: { tags } });
          return `${adding ? "added" : "removed"} customer tag "${action.tag}"`;
        }
        const tags = adding ? [...new Set([...order.tags, action.tag])] : order.tags.filter((t) => t !== action.tag);
        await this.prisma.order.update({ where: { id: order.id }, data: { tags } });
        await this.prisma.orderEvent.create({ data: { orderId: order.id, type: "tag", data: { tags, rule: ruleName }, actor: { type: "system" } } });
        return `${adding ? "added" : "removed"} order tag "${action.tag}"`;
      }
      case "set_status":
        await this.lifecycle.transition({ orderId: order.id, to: action.status, actor: { type: "system" }, reason: action.reason ?? `Automation rule: ${ruleName}` });
        return `moved order to ${action.status}`;
      case "assign_queue": {
        const staffId = await this.queue.autoAssign(order.id, "automation");
        return staffId ? `assigned to ${staffId}` : "skipped: already assigned or nobody in the queue";
      }
      case "assign_staff": {
        const staff = await this.prisma.staffUser.findFirst({ where: { id: action.staffId, status: "active", deletedAt: null }, select: { id: true } });
        if (!staff) throw new Error("Staff member not found or disabled");
        await this.prisma.order.update({ where: { id: order.id }, data: { assignedTo: staff.id } });
        await this.prisma.orderEvent.create({ data: { orderId: order.id, type: "assigned", data: { to: staff.id, rule: ruleName }, actor: { type: "system" } } });
        return `assigned to ${staff.id}`;
      }
      case "notify_staff":
        await this.staffNotifications.notifyStaffWithPermission({
          type: "automation",
          permission: action.permission,
          link: `/orders/${order.id}`,
          title: action.title,
          body: { bn: `${action.body.bn} (${order.orderNumber})`, en: `${action.body.en} (${order.orderNumber})` },
        });
        return `notified staff with ${action.permission}`;
      case "send_notification": {
        const billing = (order.billingContact as { name?: string; phone?: string; email?: string } | null) ?? null;
        const phone = order.customer?.phone ?? billing?.phone ?? null;
        await this.notifications.enqueue(this.prisma, {
          event: action.event,
          recipientType: order.customerId ? "customer" : "guest",
          recipientId: order.customerId,
          locale: order.customer?.locale ?? "bn",
          contacts: { sms: phone, whatsapp: phone, email: order.customer?.email ?? billing?.email ?? null, push: order.customerId },
          variables: {
            ...(await this.notifications.commonVariables()),
            customer_name: order.customer?.name ?? billing?.name ?? "",
            order_number: order.orderNumber,
            order_total: formatTakaFromPoisha(order.total),
            cod_amount: formatTakaFromPoisha(order.codAmount),
          },
          related: { type: "order", id: order.id },
        });
        return `queued "${action.event}" message`;
      }
      case "call_webhook": {
        const { status } = await postJsonSafely(action.url, { rule: ruleName, orderId: order.id, orderNumber: order.orderNumber, status: order.status, total: order.total });
        if (status >= 400) throw new Error(`Webhook responded ${status}`);
        return `webhook responded ${status}`;
      }
      case "add_note":
        await this.prisma.orderEvent.create({ data: { orderId: order.id, type: "note", data: { note: action.note, rule: ruleName }, actor: { type: "system" } } });
        return "added note";
    }
  }

  async recordAudit(action: string, ruleId: string, actorId: string, before?: unknown, after?: unknown): Promise<void> {
    await this.audit.record({ actorType: "staff", actorId, action, entityType: "automation_rule", entityId: ruleId, before, after });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
