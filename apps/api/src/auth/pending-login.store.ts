import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";

interface PendingLogin {
  staffUserId: string;
  expiresAt: number;
}

const TICKET_TTL_MS = 5 * 60 * 1000;

/**
 * Holds the "password verified, TOTP pending" state between the two login
 * steps. In-memory by design (docs/PROJECT_SPEC.md §15.2 free tier: no
 * mandatory Redis) — fine for a single API instance; a horizontally-scaled
 * VPS deployment would need a shared store (e.g. move this to Redis when
 * `REDIS_URL` is set). Tickets are short-lived and low-value (they grant
 * nothing without the correct TOTP code), so this is an acceptable scope
 * boundary for Milestone 1 — see docs/DECISIONS.md.
 */
@Injectable()
export class PendingLoginStore {
  private readonly tickets = new Map<string, PendingLogin>();

  create(staffUserId: string): string {
    this.sweep();
    const ticket = randomBytes(24).toString("hex");
    this.tickets.set(ticket, { staffUserId, expiresAt: Date.now() + TICKET_TTL_MS });
    return ticket;
  }

  consume(ticket: string): string | null {
    const entry = this.tickets.get(ticket);
    if (!entry) return null;
    this.tickets.delete(ticket);
    if (entry.expiresAt < Date.now()) return null;
    return entry.staffUserId;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [ticket, entry] of this.tickets) {
      if (entry.expiresAt < now) this.tickets.delete(ticket);
    }
  }
}
