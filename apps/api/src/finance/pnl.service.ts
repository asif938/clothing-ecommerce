import { BadRequestException, Injectable } from "@nestjs/common";
import { SettingsService } from "../settings/settings.service";
import { dhakaDateKey } from "../common/dhaka-time";
import { ExpensesService } from "./expenses.service";
import { ProfitService } from "./profit.service";
import { buildPnl, monthRanges, type PnlStatement } from "./pnl";

const MAX_MONTHS = 12;

export type PnlReportStatement = PnlStatement & { range: { from: Date; to: Date }; uncostedUnits: number; courierEstimatedOrders: number };

/** Profit & loss statement (docs/PROJECT_SPEC.md §8.2 Finance, §16 M17): the M12 true-profit report plus ad spend and operating expenses. */
@Injectable()
export class PnlService {
  constructor(
    private readonly profit: ProfitService,
    private readonly expenses: ExpensesService,
    private readonly settings: SettingsService,
  ) {}

  async statement(from: Date, to: Date): Promise<PnlReportStatement> {
    const [report, expenses, countAdSpend] = await Promise.all([
      this.profit.report(from, to),
      this.expenses.totalsByCategory(dhakaDateKey(from), dhakaDateKey(to)),
      this.settings.getValue<boolean>("finance.pnl.countAdSpend"),
    ]);
    const s = report.summary;
    return {
      range: { from, to },
      ...buildPnl({ revenue: s.revenue, cogs: s.cogs, courierCost: s.courierCost, gatewayFees: s.gatewayFees, adSpend: s.adSpend, expenses, countAdSpend }),
      uncostedUnits: s.uncostedUnits,
      courierEstimatedOrders: s.courierEstimatedOrders,
    };
  }

  async report(from: Date, to: Date, groupBy: "total" | "month") {
    if (to < from) throw new BadRequestException({ code: "INVALID_RANGE", message: "The end date is before the start date" });
    // Validate the monthly split before doing any (slow) report work.
    const ranges = groupBy === "month" ? monthRanges(from, to) : [];
    if (ranges.length > MAX_MONTHS) throw new BadRequestException({ code: "RANGE_TOO_LONG", message: `The monthly view covers at most ${MAX_MONTHS} months` });

    const [total, categories] = await Promise.all([this.statement(from, to), this.expenses.categories()]);
    const months: { month: string; statement: PnlReportStatement }[] = [];
    for (const range of ranges) months.push({ month: range.key, statement: await this.statement(range.from, range.to) });
    return { total, months, categories };
  }
}
