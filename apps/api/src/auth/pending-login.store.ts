import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.schema";

const TICKET_TTL_MS = 5 * 60 * 1000;

interface TicketPayload {
  /** Staff user id. */
  sub: string;
  /** Expiry, epoch ms. */
  exp: number;
  /** Random nonce so two tickets for the same user never look alike. */
  n: string;
}

/**
 * The "password verified, TOTP pending" ticket between the two login steps.
 *
 * A signed, self-contained token (HMAC with a key derived from `APP_ENCRYPTION_KEY`), not an in-memory map: the
 * old map was lost on every restart (Render free-tier instances spin down) and didn't work with more than one API
 * instance. A ticket grants nothing on its own — it still needs a correct TOTP code, and wrong codes count toward
 * the account's login lockout (`AuthService.loginTotp`), which is what bounds guessing now that a ticket can be
 * presented more than once within its 5 minutes.
 */
@Injectable()
export class PendingLoginStore {
  private readonly key: Buffer;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.key = createHmac("sha256", config.get("APP_ENCRYPTION_KEY", { infer: true })).update("staff-pending-login").digest();
  }

  create(staffUserId: string, now = Date.now()): string {
    const payload: TicketPayload = { sub: staffUserId, exp: now + TICKET_TTL_MS, n: randomBytes(12).toString("base64url") };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${this.sign(body)}`;
  }

  /** The staff user id for a valid, unexpired ticket; null otherwise. */
  consume(ticket: string, now = Date.now()): string | null {
    const [body, signature, extra] = ticket.split(".");
    if (!body || !signature || extra !== undefined) return null;
    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<TicketPayload>;
      if (typeof payload.sub !== "string" || typeof payload.exp !== "number" || payload.exp < now) return null;
      return payload.sub;
    } catch {
      return null;
    }
  }

  private sign(body: string): string {
    return createHmac("sha256", this.key).update(body).digest("base64url");
  }
}
