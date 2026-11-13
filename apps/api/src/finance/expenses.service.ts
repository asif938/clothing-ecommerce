import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@clothing/db";
import type { ExpenseCategoryDef } from "@clothing/shared/analytics";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthenticatedStaff } from "../common/types";
import type { ExpenseDto, ListExpensesQueryDto, UpdateExpenseDto } from "./dto";

const toDate = (key: string) => new Date(`${key}T00:00:00.000Z`);

/**
 * Operating expenses (docs/PROJECT_SPEC.md §5.10 `expenses`, §8.2 Finance
 * "expenses", §16 M17) — rent, salaries, packaging and the rest, feeding the
 * P&L. Categories come from the `finance.expenseCategories` setting.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  categories(): Promise<ExpenseCategoryDef[]> {
    return this.settings.getValue<ExpenseCategoryDef[]>("finance.expenseCategories");
  }

  private async assertCategory(category: string) {
    const known = (await this.categories()).some((c) => c.key === category);
    if (!known) throw new BadRequestException({ code: "EXPENSE_CATEGORY_UNKNOWN", message: `"${category}" is not an expense category — add it under Settings → Finance first` });
  }

  private async assertSupplier(supplierId: string | null | undefined) {
    if (!supplierId) return;
    if (!(await this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true } }))) throw new BadRequestException({ code: "SUPPLIER_INVALID", message: "Supplier not found" });
  }

  private where(query: Pick<ListExpensesQueryDto, "from" | "to" | "category">): Prisma.ExpenseWhereInput {
    return {
      ...(query.from || query.to ? { date: { ...(query.from ? { gte: toDate(query.from) } : {}), ...(query.to ? { lte: toDate(query.to) } : {}) } } : {}),
      ...(query.category ? { category: query.category } : {}),
    };
  }

  async list(query: ListExpensesQueryDto) {
    const where = this.where(query);
    const [rows, byCategory, categories] = await Promise.all([
      this.prisma.expense.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1000, include: { supplier: { select: { id: true, name: true } } } }),
      this.prisma.expense.groupBy({ by: ["category"], where, _sum: { amount: true }, _count: { _all: true } }),
      this.categories(),
    ]);
    return {
      rows: rows.map((r) => ({ ...r, date: r.date.toISOString().slice(0, 10) })),
      byCategory: byCategory.map((c) => ({ category: c.category, amount: c._sum.amount ?? 0, count: c._count._all })).sort((a, b) => b.amount - a.amount),
      total: byCategory.reduce((a, c) => a + (c._sum.amount ?? 0), 0),
      categories,
    };
  }

  /** Total per category for the P&L; `fromKey`/`toKey` are Dhaka `YYYY-MM-DD` days, inclusive. */
  async totalsByCategory(fromKey: string, toKey: string): Promise<Record<string, number>> {
    const groups = await this.prisma.expense.groupBy({ by: ["category"], where: { date: { gte: toDate(fromKey), lte: toDate(toKey) } }, _sum: { amount: true } });
    return Object.fromEntries(groups.map((g) => [g.category, g._sum.amount ?? 0]));
  }

  async create(dto: ExpenseDto, actor: AuthenticatedStaff) {
    await this.assertCategory(dto.category);
    await this.assertSupplier(dto.supplierId);
    const expense = await this.prisma.expense.create({
      data: { date: toDate(dto.date), category: dto.category, amount: dto.amount, note: dto.note ?? null, attachmentUrl: dto.attachmentUrl ?? null, supplierId: dto.supplierId ?? null, createdBy: actor.id },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "expense.create", entityType: "expense", entityId: expense.id, after: { date: dto.date, category: dto.category, amount: dto.amount } });
    return expense;
  }

  async update(id: string, dto: UpdateExpenseDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.expense.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: "EXPENSE_NOT_FOUND", message: "Expense not found" });
    if (dto.category !== undefined && dto.category !== before.category) await this.assertCategory(dto.category);
    await this.assertSupplier(dto.supplierId);
    const { date, ...rest } = dto;
    const expense = await this.prisma.expense.update({ where: { id }, data: { ...rest, ...(date ? { date: toDate(date) } : {}) } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "expense.update", entityType: "expense", entityId: id, before: { date: before.date.toISOString().slice(0, 10), category: before.category, amount: before.amount }, after: dto });
    return expense;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.prisma.expense.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: "EXPENSE_NOT_FOUND", message: "Expense not found" });
    await this.prisma.expense.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "expense.delete", entityType: "expense", entityId: id, before: { date: before.date.toISOString().slice(0, 10), category: before.category, amount: before.amount, note: before.note } });
  }
}
