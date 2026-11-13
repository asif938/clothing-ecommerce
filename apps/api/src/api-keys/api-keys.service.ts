import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { API_SCOPE_KEYS } from "@clothing/shared/analytics";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { generateApiKey, hashApiKey, hashesMatch, keyStatus, looksLikeApiKey, API_KEY_PREFIX_LENGTH } from "./api-key";

export interface AuthenticatedApiKey {
  id: string;
  name: string;
  scopes: string[];
}

/** Last-used is a courtesy for the admin list; writing it on every request would turn each read into a write. */
const LAST_USED_REFRESH_MS = 5 * 60_000;

/**
 * Public API keys (docs/PROJECT_SPEC.md §11.1, §16 M17): staff create a key
 * with a set of read scopes, copy the plaintext once, and can revoke it at
 * any time. Creation, revocation and every use of the admin screens are
 * audit-logged; the plaintext key is never logged or stored.
 */
@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const keys = await this.prisma.apiKey.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, prefix: true, scopes: true, expiresAt: true, lastUsedAt: true, revokedAt: true, createdBy: true, createdAt: true } });
    const now = new Date();
    return keys.map((k) => ({ ...k, status: keyStatus(k, now) }));
  }

  /** Returns the plaintext key exactly once. */
  async create(input: { name: string; scopes: string[]; expiresAt?: Date | null }, actor: AuthenticatedStaff) {
    const unknown = input.scopes.filter((s) => !(API_SCOPE_KEYS as readonly string[]).includes(s));
    if (unknown.length > 0) throw new BadRequestException({ code: "SCOPE_UNKNOWN", message: `Unknown scope: ${unknown.join(", ")}` });
    if (input.scopes.length === 0) throw new BadRequestException({ code: "SCOPE_REQUIRED", message: "Choose at least one scope" });
    if (input.expiresAt && input.expiresAt <= new Date()) throw new BadRequestException({ code: "EXPIRY_IN_PAST", message: "The expiry date must be in the future" });

    const { key, prefix, hash } = generateApiKey();
    const record = await this.prisma.apiKey.create({ data: { name: input.name, prefix, keyHash: hash, scopes: [...new Set(input.scopes)], expiresAt: input.expiresAt ?? null, createdBy: actor.id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "api_key.create", entityType: "api_key", entityId: record.id, after: { name: input.name, prefix, scopes: record.scopes, expiresAt: record.expiresAt } });
    return { id: record.id, name: record.name, prefix, scopes: record.scopes, expiresAt: record.expiresAt, key };
  }

  async revoke(id: string, actor: AuthenticatedStaff) {
    const key = await this.prisma.apiKey.findUnique({ where: { id }, select: { id: true, name: true, prefix: true, revokedAt: true } });
    if (!key) throw new NotFoundException({ code: "API_KEY_NOT_FOUND", message: "API key not found" });
    if (key.revokedAt) return { id, revoked: true };
    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "api_key.revoke", entityType: "api_key", entityId: id, before: { name: key.name, prefix: key.prefix } });
    return { id, revoked: true };
  }

  /** Resolves a presented key to its record, or null if it is unknown, revoked or expired. */
  async authenticate(presented: string): Promise<AuthenticatedApiKey | null> {
    if (!looksLikeApiKey(presented)) return null;
    const record = await this.prisma.apiKey.findUnique({ where: { prefix: presented.slice(0, API_KEY_PREFIX_LENGTH) } });
    if (!record || !hashesMatch(record.keyHash, hashApiKey(presented))) return null;
    const now = new Date();
    if (keyStatus(record, now) !== "active") return null;
    if (!record.lastUsedAt || now.getTime() - record.lastUsedAt.getTime() > LAST_USED_REFRESH_MS) {
      // Best effort: failing to stamp last-used must never fail the request.
      await this.prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: now } }).catch(() => undefined);
    }
    return { id: record.id, name: record.name, scopes: record.scopes };
  }
}
