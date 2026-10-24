import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { evaluatePaymentRules, type PaymentRule, type PaymentRulesOutcome, type RuleContext } from "./payment-rules-engine";
import type { CreatePaymentRuleDto, UpdatePaymentRuleDto } from "./dto";

/** Payment rules editor + engine (docs/PROJECT_SPEC.md §5.7, §6.5). */
@Injectable()
export class PaymentRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.paymentRule.findMany({ orderBy: { priority: "desc" } });
  }

  async get(id: string) {
    const rule = await this.prisma.paymentRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException("Payment rule not found");
    return rule;
  }

  async create(dto: CreatePaymentRuleDto, actor: AuthenticatedStaff) {
    const rule = await this.prisma.paymentRule.create({ data: { ...dto, conditions: dto.conditions as Prisma.InputJsonValue, actions: dto.actions as unknown as Prisma.InputJsonValue } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "payment_rule.create", entityType: "payment_rule", entityId: rule.id, after: rule });
    return rule;
  }

  async update(id: string, dto: UpdatePaymentRuleDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const { conditions, actions, ...rest } = dto;
    const rule = await this.prisma.paymentRule.update({
      where: { id },
      data: { ...rest, ...(conditions !== undefined ? { conditions: conditions as Prisma.InputJsonValue } : {}), ...(actions !== undefined ? { actions: actions as unknown as Prisma.InputJsonValue } : {}) },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "payment_rule.update", entityType: "payment_rule", entityId: id, before, after: rule });
    return rule;
  }

  async remove(id: string, actor: AuthenticatedStaff): Promise<void> {
    const before = await this.get(id);
    await this.prisma.paymentRule.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "payment_rule.delete", entityType: "payment_rule", entityId: id, before });
  }

  async evaluate(ctx: RuleContext): Promise<PaymentRulesOutcome> {
    const rows = await this.prisma.paymentRule.findMany({ where: { isActive: true } });
    const rules: PaymentRule[] = rows.map((r) => ({
      id: r.id,
      priority: r.priority,
      isActive: r.isActive,
      conditions: r.conditions as PaymentRule["conditions"],
      actions: r.actions as unknown as PaymentRule["actions"],
      stopProcessing: r.stopProcessing,
    }));
    return evaluatePaymentRules(rules, ctx);
  }
}
