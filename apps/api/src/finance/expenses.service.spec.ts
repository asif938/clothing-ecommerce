import { describe, expect, it, vi } from "vitest";
import { DEFAULT_EXPENSE_CATEGORIES } from "@clothing/shared/analytics";
import { ExpensesService } from "./expenses.service";
import { PnlService } from "./pnl.service";

const actor = { id: "staff-1", name: "A", email: "a@x", locale: "en", permissions: new Set<string>(), isSuperAdmin: false, totpEnabled: true };

function makeExpenses(existing: Record<string, unknown> | null = null) {
  const prisma = {
    expense: {
      create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: "e1", ...args.data })),
      findUnique: vi.fn(() => Promise.resolve(existing)),
      update: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: "e1", ...args.data })),
      delete: vi.fn(() => Promise.resolve({})),
      groupBy: vi.fn(() => Promise.resolve([{ category: "rent", _sum: { amount: 500_000 } }, { category: "salaries", _sum: { amount: null } }])),
    },
    supplier: { findUnique: vi.fn(() => Promise.resolve({ id: "s1" })) },
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const settings = { getValue: vi.fn(() => Promise.resolve(DEFAULT_EXPENSE_CATEGORIES)) };
  return { service: new ExpensesService(prisma as never, audit as never, settings as never), prisma, audit };
}

describe("ExpensesService", () => {
  it("stores the date as a plain calendar day and audits it", async () => {
    const { service, prisma, audit } = makeExpenses();
    await service.create({ date: "2026-11-13", category: "rent", amount: 2_500_000, note: "November" }, actor);
    expect(prisma.expense.create).toHaveBeenCalledWith({ data: expect.objectContaining({ date: new Date("2026-11-13T00:00:00.000Z"), amount: 2_500_000, createdBy: "staff-1" }) });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "expense.create" }));
  });

  it("rejects a category that is not in the settings list", async () => {
    const { service, prisma } = makeExpenses();
    await expect(service.create({ date: "2026-11-13", category: "yacht", amount: 1 }, actor)).rejects.toMatchObject({ response: { code: "EXPENSE_CATEGORY_UNKNOWN" } });
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });

  it("only validates the category on update when it changes (old rows keep working after a category is removed)", async () => {
    const existing = { id: "e1", date: new Date("2026-10-01T00:00:00Z"), category: "retired", amount: 100, note: null };
    const { service, prisma } = makeExpenses(existing);
    await service.update("e1", { amount: 200 }, actor);
    await service.update("e1", { category: "retired" }, actor);
    expect(prisma.expense.update).toHaveBeenCalledTimes(2);
    await expect(service.update("e1", { category: "yacht" }, actor)).rejects.toMatchObject({ response: { code: "EXPENSE_CATEGORY_UNKNOWN" } });
  });

  it("404s on a missing expense", async () => {
    const { service } = makeExpenses(null);
    await expect(service.update("nope", { amount: 1 }, actor)).rejects.toMatchObject({ response: { code: "EXPENSE_NOT_FOUND" } });
    await expect(service.remove("nope", actor)).rejects.toMatchObject({ response: { code: "EXPENSE_NOT_FOUND" } });
  });

  it("totals per category treating a null sum as zero", async () => {
    const { service } = makeExpenses();
    expect(await service.totalsByCategory("2026-11-01", "2026-11-30")).toEqual({ rent: 500_000, salaries: 0 });
  });
});

describe("PnlService", () => {
  function makePnl(countAdSpend: boolean) {
    const profit = { report: vi.fn(() => Promise.resolve({ summary: { revenue: 1_000_000, cogs: 400_000, courierCost: 50_000, gatewayFees: 10_000, adSpend: 40_000, uncostedUnits: 2, courierEstimatedOrders: 1 } })) };
    const expenses = { totalsByCategory: vi.fn(() => Promise.resolve({ rent: 100_000 })), categories: vi.fn(() => Promise.resolve(DEFAULT_EXPENSE_CATEGORIES)) };
    const settings = { getValue: vi.fn(() => Promise.resolve(countAdSpend)) };
    return { service: new PnlService(profit as never, expenses as never, settings as never), profit, expenses };
  }

  it("combines the profit report, ad spend and expenses", async () => {
    const { service } = makePnl(true);
    const s = await service.statement(new Date("2026-11-01T00:00:00+06:00"), new Date("2026-11-30T23:59:59+06:00"));
    expect(s.netProfit).toBe(1_000_000 - 400_000 - 50_000 - 10_000 - 40_000 - 100_000);
    expect(s).toMatchObject({ uncostedUnits: 2, courierEstimatedOrders: 1 });
  });

  it("builds one statement per Dhaka month and refuses ranges over a year", async () => {
    const { service, expenses } = makePnl(false);
    const report = await service.report(new Date("2026-09-15T00:00:00+06:00"), new Date("2026-11-10T00:00:00+06:00"), "month");
    expect(report.months.map((m) => m.month)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(expenses.totalsByCategory).toHaveBeenCalledWith("2026-09-15", "2026-09-30");
    expect(report.months[0]!.statement.adSpend).toBe(0);
    expect(report.categories.length).toBeGreaterThan(0);
    await expect(service.report(new Date("2025-01-01"), new Date("2026-11-10"), "month")).rejects.toMatchObject({ response: { code: "RANGE_TOO_LONG" } });
    await expect(service.report(new Date("2026-11-10"), new Date("2026-11-01"), "total")).rejects.toMatchObject({ response: { code: "INVALID_RANGE" } });
  });
});
