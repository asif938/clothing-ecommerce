import { randomBytes, createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";

export const STAFF_SESSION_COOKIE = "staff_session";
const RAW_TOKEN_BYTES = 32;

function hashToken(rawToken: string): string {
  // A lookup-key hash, not a password hash: the raw token already has 256
  // bits of entropy, so a fast one-way hash (not argon2) is the right tool —
  // it only needs to keep a stolen DB dump from being replayed as sessions.
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface CreateSessionResult {
  rawToken: string;
  expiresAt: Date;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async createSession(staffUserId: string, ip: string | null, userAgent: string | null): Promise<CreateSessionResult> {
    const ttlHours = await this.settings.getValue<number>("security.staffSessionTtlHours");
    const rawToken = randomBytes(RAW_TOKEN_BYTES).toString("hex");
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await this.prisma.staffSession.create({
      data: {
        staffUserId,
        tokenHash: hashToken(rawToken),
        ip,
        userAgent,
        expiresAt,
      },
    });

    return { rawToken, expiresAt };
  }

  async validateSession(rawToken: string) {
    const session = await this.prisma.staffSession.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: {
        staffUser: {
          include: { roles: { include: { role: { include: { permissions: true } } } } },
        },
      },
    });

    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    if (session.staffUser.status !== "active") return null;
    if (session.staffUser.deletedAt) return null;

    return session;
  }

  async revokeSession(rawToken: string): Promise<void> {
    await this.prisma.staffSession.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
