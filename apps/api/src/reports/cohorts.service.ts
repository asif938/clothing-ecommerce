import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { dhakaDateKey } from "../common/dhaka-time";
import { buildCohortMatrix, monthIndex, monthKeyFromIndex, summarizeLtv, type CohortActivityRow } from "./cohorts";

/** Orders that count as realized revenue — same definition as the true-profit report (M12). */
const REALIZED = ["delivered", "partially_delivered", "completed"];

/**
 * Cohort retention and lifetime value (docs/PROJECT_SPEC.md §8.2 Reports,
 * §16 M17). The aggregation runs in SQL (a store with years of orders
 * shouldn't ship every row to Node); `cohorts.ts` shapes the result.
 * Guest orders have no customer id and can't be followed over time, so they
 * are left out.
 */
@Injectable()
export class CohortsService {
  constructor(private readonly prisma: PrismaService) {}

  async report(months: number) {
    const currentMonth = dhakaDateKey(new Date()).slice(0, 7);
    const firstMonth = monthKeyFromIndex(monthIndex(currentMonth) - (months - 1));
    // 00:00 Dhaka on the first of the first month, as a UTC instant.
    const since = new Date(`${firstMonth}-01T00:00:00+06:00`);

    const [activity, perCustomer] = await Promise.all([
      this.prisma.$queryRaw<{ cohort: string; month: string; customers: number; orders: number; revenue: number | bigint }[]>`
        WITH realized AS (
          SELECT customer_id, created_at, (total - refunded_total) AS net
          FROM orders
          WHERE customer_id IS NOT NULL AND status::text = ANY(${REALIZED}::text[])
        ), first_order AS (
          SELECT customer_id, MIN(created_at) AS first_at FROM realized GROUP BY customer_id
        )
        SELECT to_char(f.first_at + interval '6 hours', 'YYYY-MM') AS cohort,
               to_char(r.created_at + interval '6 hours', 'YYYY-MM') AS month,
               COUNT(DISTINCT r.customer_id)::int AS customers,
               COUNT(*)::int AS orders,
               COALESCE(SUM(r.net), 0)::bigint AS revenue
        FROM realized r
        JOIN first_order f ON f.customer_id = r.customer_id
        WHERE f.first_at >= ${since}
        GROUP BY 1, 2
        ORDER BY 1, 2`,
      this.prisma.$queryRaw<{ orders: number; revenue: number | bigint }[]>`
        SELECT COUNT(*)::int AS orders, COALESCE(SUM(total - refunded_total), 0)::bigint AS revenue
        FROM orders
        WHERE customer_id IS NOT NULL AND status::text = ANY(${REALIZED}::text[])
        GROUP BY customer_id`,
    ]);

    const rows: CohortActivityRow[] = activity.map((a) => ({ cohort: a.cohort, month: a.month, customers: Number(a.customers), orders: Number(a.orders), revenue: Number(a.revenue) }));
    return {
      months,
      currentMonth,
      maxOffset: months - 1,
      cohorts: buildCohortMatrix(rows, currentMonth, months - 1),
      summary: summarizeLtv(perCustomer.map((c) => ({ orders: Number(c.orders), revenue: Number(c.revenue) }))),
    };
  }
}
