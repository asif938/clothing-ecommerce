import { Injectable } from "@nestjs/common";
import { Prisma, type AuditActorType } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";

// Prisma rejects a plain `null` for a nullable Json column (ambiguous
// between "no value" and "JSON null") — it requires `Prisma.DbNull`.
function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

export interface RecordAuditParams {
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Golden rule 7: every admin mutation is permission-checked and
 * audit-logged. `audit_logs` is append-only (docs/PROJECT_SPEC.md §5.1) —
 * nothing in this service updates or deletes a row.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordAuditParams): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorType: params.actorType,
        actorId: params.actorId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        before: toJsonInput(params.before),
        after: toJsonInput(params.after),
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  }
}
