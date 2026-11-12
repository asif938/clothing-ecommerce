/**
 * Anomaly detection for the dashboard alerts (docs/PROJECT_SPEC.md §8.2
 * Dashboard "alerts (anomalies …)", §16 M12). Deliberately simple and
 * explainable to shop staff: compare yesterday's value with the mean of the
 * previous N days; alert when it is more than `thresholdPercent` away.
 *  - count/amount metrics (orders, revenue) alert on drops *and* spikes —
 *    a spike can be a bot or a pricing mistake;
 *  - rate metrics (cancellation, rejection) alert only on increases, and
 *    are judged in percentage *points* against the threshold scaled to the
 *    baseline rate, with a small absolute floor so 1% → 2% isn't "critical".
 * Severity is critical at twice the threshold.
 */

export type AnomalyMetricKind = "count" | "rate";

export interface AnomalyMetricInput {
  metric: string;
  kind: AnomalyMetricKind;
  observed: number;
  baseline: number[];
}

export interface AnomalyOptions {
  thresholdPercent: number;
  /** Skip everything when average daily orders in the baseline are below this. */
  minBaselineOrders: number;
  baselineAverageOrders: number;
}

export interface DetectedAnomaly {
  metric: string;
  direction: "up" | "down";
  severity: "warning" | "critical";
  observed: number;
  expected: number;
  /** Relative change vs expected (0.6 = +60%). */
  change: number;
}

const RATE_ABSOLUTE_FLOOR = 0.05; // 5 percentage points

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function detectAnomalies(inputs: AnomalyMetricInput[], options: AnomalyOptions): DetectedAnomaly[] {
  if (options.baselineAverageOrders < options.minBaselineOrders) return [];
  const threshold = options.thresholdPercent / 100;
  const found: DetectedAnomaly[] = [];

  for (const input of inputs) {
    if (input.baseline.length === 0) continue;
    const expected = mean(input.baseline);

    if (input.kind === "rate") {
      const increase = input.observed - expected;
      const needed = Math.max(RATE_ABSOLUTE_FLOOR, expected * threshold);
      if (increase <= needed) continue;
      found.push({
        metric: input.metric,
        direction: "up",
        severity: increase > needed * 2 ? "critical" : "warning",
        observed: input.observed,
        expected,
        change: expected > 0 ? increase / expected : increase,
      });
      continue;
    }

    if (expected <= 0) continue;
    const change = (input.observed - expected) / expected;
    if (Math.abs(change) < threshold) continue;
    found.push({
      metric: input.metric,
      direction: change > 0 ? "up" : "down",
      severity: Math.abs(change) >= threshold * 2 ? "critical" : "warning",
      observed: input.observed,
      expected,
      change,
    });
  }
  return found;
}
