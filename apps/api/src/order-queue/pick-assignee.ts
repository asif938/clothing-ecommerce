export interface QueueCandidate {
  id: string;
  /** Orders currently assigned to them and not yet past `processing`. */
  openCount: number;
  lastAssignedAt: Date | null;
}

export type QueueStrategy = "round_robin" | "load_based";

/**
 * Chooses who gets the next order (§8.2 "Order queue"). round_robin = whoever
 * has gone longest without an assignment (never-assigned first); load_based =
 * fewest open orders, ties broken by longest wait, then id for determinism.
 */
export function pickAssignee(candidates: QueueCandidate[], strategy: QueueStrategy): string | null {
  if (candidates.length === 0) return null;
  const waited = (c: QueueCandidate) => c.lastAssignedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const sorted = [...candidates].sort((a, b) => {
    if (strategy === "load_based" && a.openCount !== b.openCount) return a.openCount - b.openCount;
    if (waited(a) !== waited(b)) return waited(a) < waited(b) ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
  return sorted[0]!.id;
}
