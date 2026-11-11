import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@clothing/db";
import { AUTOMATION_TEMPLATES, ORDER_CONDITION_FIELDS, evaluateConditions, explainConditions, type AutomationRuleInput, type ConditionContext, type ConditionGroup } from "@clothing/shared/automation";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { AutomationEngineService } from "./automation-engine.service";
import type { TestRuleDto } from "./dto";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Admin CRUD, templates, run history and the "test with sample event" dry run for automation rules (docs/PROJECT_SPEC.md §8.2 Automation, §16 M11). */
@Injectable()
export class AutomationRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly engine: AutomationEngineService,
  ) {}

  list() {
    return this.prisma.automationRule.findMany({ orderBy: [{ trigger: "asc" }, { priority: "asc" }, { createdAt: "asc" }] });
  }

  templates() {
    return AUTOMATION_TEMPLATES;
  }

  conditionFields() {
    return ORDER_CONDITION_FIELDS;
  }

  async create(input: AutomationRuleInput, actor: AuthenticatedStaff) {
    await this.assertActionsValid(input);
    const rule = await this.prisma.automationRule.create({
      data: { name: input.name, trigger: input.trigger, conditions: toJson(input.conditions), actions: toJson(input.actions), stopProcessing: input.stopProcessing, priority: input.priority, isActive: input.isActive },
    });
    await this.engine.recordAudit("automation.create", rule.id, actor.id, undefined, rule);
    return rule;
  }

  async createFromTemplate(key: string, actor: AuthenticatedStaff) {
    const template = AUTOMATION_TEMPLATES.find((t) => t.key === key);
    if (!template) throw new NotFoundException("Template not found");
    // Created inactive: a template's thresholds are examples, the owner reviews then enables.
    return await this.create(
      { name: template.name.en, trigger: template.trigger, conditions: template.conditions, actions: template.actions, stopProcessing: template.stopProcessing ?? false, priority: 100, isActive: false },
      actor,
    );
  }

  async update(id: string, input: AutomationRuleInput, actor: AuthenticatedStaff) {
    const before = await this.prisma.automationRule.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Rule not found");
    await this.assertActionsValid(input);
    const rule = await this.prisma.automationRule.update({
      where: { id },
      data: { name: input.name, trigger: input.trigger, conditions: toJson(input.conditions), actions: toJson(input.actions), stopProcessing: input.stopProcessing, priority: input.priority, isActive: input.isActive },
    });
    await this.engine.recordAudit("automation.update", id, actor.id, before, rule);
    return rule;
  }

  async setActive(id: string, isActive: boolean, actor: AuthenticatedStaff) {
    const before = await this.prisma.automationRule.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Rule not found");
    const rule = await this.prisma.automationRule.update({ where: { id }, data: { isActive } });
    await this.engine.recordAudit(isActive ? "automation.enable" : "automation.disable", id, actor.id, { isActive: before.isActive }, { isActive });
    return rule;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.prisma.automationRule.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Rule not found");
    await this.prisma.automationRule.delete({ where: { id } });
    await this.engine.recordAudit("automation.delete", id, actor.id, before);
  }

  runs(ruleId: string | undefined, limit: number) {
    return this.prisma.automationRun.findMany({ where: ruleId ? { ruleId } : {}, orderBy: { createdAt: "desc" }, take: limit, include: { rule: { select: { name: true } } } });
  }

  /** Dry run: evaluates conditions against a real order (by id) or a hand-built sample, and lists what the actions would do — nothing is executed. */
  async test(dto: TestRuleDto) {
    let context: ConditionContext = dto.context ?? {};
    if (dto.orderId) {
      const loaded = await this.engine.buildContextForOrder(dto.orderId);
      if (!loaded) throw new NotFoundException("Order not found");
      context = loaded.context;
    }
    const conditions: ConditionGroup = dto.conditions;
    return {
      matched: evaluateConditions(conditions, context),
      explanation: explainConditions(conditions, context),
      context,
      wouldRun: dto.actions.map((a) => a.type),
    };
  }

  private async assertActionsValid(input: AutomationRuleInput): Promise<void> {
    for (const action of input.actions) {
      if (action.type === "assign_staff") {
        const staff = await this.prisma.staffUser.findFirst({ where: { id: action.staffId, deletedAt: null }, select: { id: true } });
        if (!staff) throw new BadRequestException({ code: "INVALID_STAFF", message: "An assign action points at a staff member that doesn't exist." });
      }
      if (action.type === "send_notification") {
        const exists = await this.prisma.messageTemplate.findFirst({ where: { event: action.event as never }, select: { id: true } });
        if (!exists) throw new BadRequestException({ code: "INVALID_EVENT", message: `"${action.event}" isn't a known message event.` });
      }
    }
  }
}
