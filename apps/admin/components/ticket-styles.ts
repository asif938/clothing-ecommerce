/** Shared ticket row shape and SLA/priority colours (§16 M15). */
export type Sla = "met" | "breached" | "due_soon" | "on_track" | null;

export interface TicketRow {
  id: string;
  number: string;
  subject: string;
  type: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "pending" | "resolved" | "closed";
  contactName: string | null;
  contactPhone: string | null;
  assignedTo: string | null;
  resolutionDueAt: string;
  firstResponseDueAt: string;
  firstResponseSla: Sla;
  resolutionSla: Sla;
  createdAt: string;
}

export const SLA_STYLE: Record<Exclude<Sla, null>, string> = {
  met: "text-success",
  on_track: "text-surface-foreground/70",
  due_soon: "text-warning font-medium",
  breached: "text-danger font-semibold",
};

export const PRIORITY_STYLE: Record<TicketRow["priority"], string> = {
  low: "bg-muted text-surface-foreground",
  normal: "bg-brand/10 text-brand",
  high: "bg-warning/15 text-warning",
  urgent: "bg-danger/15 text-danger",
};
