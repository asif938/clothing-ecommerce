import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@clothing/db";
import { conditionGroupSchema, evaluateConditions, type ConditionContext } from "@clothing/shared/automation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { OrderContextService } from "../automation/order-context.service";
import type { CourierRuleInput } from "./dto";

export interface CourierMatch {
  ruleId: string;
  ruleName: string;
  providerInstanceId: string;
}

interface RuleRow {
  id: string;
  name: string;
  priority: number;
  conditions: unknown;
  courierProviderInstanceId: string;
  isActive: boolean;
}

/** Pure: first active rule (lowest priority number first) whose conditions match wins. Exported for tests. */
export function pickCourierRule(rules: RuleRow[], context: ConditionContext): CourierMatch | null {
  const ordered = [...rules].filter((r) => r.isActive).sort((a, b) => a.priority - b.priority);
  for (const rule of ordered) {
    const conditions = conditionGroupSchema.safeParse(rule.conditions);
    if (conditions.success && evaluateConditions(conditions.data, context)) {
      return { ruleId: rule.id, ruleName: rule.name, providerInstanceId: rule.courierProviderInstanceId };
    }
  }
  return null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Auto courier assignment rules (docs/PROJECT_SPEC.md §16 M11): "orders to Chattogram go to Pathao, COD over 10k to RedX, everything else Steadfast". */
@Injectable()
export class CourierRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orderContext: OrderContextService,
  ) {}

  list() {
    return this.prisma.courierAssignmentRule.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
  }

  /** Which courier instance a booking for this order should use, or null when no rule matches. */
  async resolve(orderId: string): Promise<CourierMatch | null> {
    const loaded = await this.orderContext.forOrder(orderId);
    if (!loaded) throw new NotFoundException("Order not found");
    const rules = await this.prisma.courierAssignmentRule.findMany({ where: { isActive: true } });
    return pickCourierRule(rules, loaded.context);
  }

  async create(input: CourierRuleInput, actor: AuthenticatedStaff) {
    await this.assertCourier(input.courierProviderInstanceId);
    const rule = await this.prisma.courierAssignmentRule.create({
      data: { name: input.name, priority: input.priority, conditions: toJson(input.conditions), courierProviderInstanceId: input.courierProviderInstanceId, isActive: input.isActive },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "courier_rule.create", entityType: "courier_rule", entityId: rule.id, after: rule });
    return rule;
  }

  async update(id: string, input: CourierRuleInput, actor: AuthenticatedStaff) {
    const before = await this.prisma.courierAssignmentRule.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Rule not found");
    await this.assertCourier(input.courierProviderInstanceId);
    const rule = await this.prisma.courierAssignmentRule.update({
      where: { id },
      data: { name: input.name, priority: input.priority, conditions: toJson(input.conditions), courierProviderInstanceId: input.courierProviderInstanceId, isActive: input.isActive },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "courier_rule.update", entityType: "courier_rule", entityId: id, before, after: rule });
    return rule;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.prisma.courierAssignmentRule.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Rule not found");
    await this.prisma.courierAssignmentRule.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "courier_rule.delete", entityType: "courier_rule", entityId: id, before });
  }

  private async assertCourier(instanceId: string): Promise<void> {
    const instance = await this.prisma.providerInstance.findUnique({ where: { id: instanceId }, select: { capability: true } });
    if (!instance || instance.capability !== "courier") {
      throw new BadRequestException({ code: "COURIER_NOT_CONFIGURED", message: "That courier isn't configured." });
    }
  }
}
