import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export const CUSTOMER_ACCESS_COOKIE = "customer_access_token";
export const CUSTOMER_REFRESH_COOKIE = "customer_refresh_token";
export const ANONYMOUS_ID_COOKIE = "anonymous_id";

const REFRESH_TOKEN_TTL_DAYS = 30;
const RAW_TOKEN_BYTES = 32;

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Rotating refresh cookie (§11.1) — each use issues a new raw token and revokes the old session row, same reuse-detection shape as a refresh-token rotation scheme. */
@Injectable()
export class CustomerSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(customerId: string, ip: string | null, device: string | null): Promise<{ rawToken: string; expiresAt: Date }> {
    const rawToken = randomBytes(RAW_TOKEN_BYTES).toString("hex");
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.customerSession.create({ data: { customerId, refreshTokenHash: hashToken(rawToken), ip, device, expiresAt } });
    return { rawToken, expiresAt };
  }

  /** Validates the refresh token, revokes it, and issues a replacement — call sites must treat the old raw token as single-use. */
  async rotate(rawToken: string, ip: string | null, device: string | null): Promise<{ customerId: string; rawToken: string; expiresAt: Date } | null> {
    const session = await this.prisma.customerSession.findFirst({
      where: { refreshTokenHash: hashToken(rawToken), revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!session) return null;

    await this.prisma.customerSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const next = await this.createSession(session.customerId, ip, device);
    return { customerId: session.customerId, ...next };
  }

  async revoke(rawToken: string): Promise<void> {
    await this.prisma.customerSession.updateMany({ where: { refreshTokenHash: hashToken(rawToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
