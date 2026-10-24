import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateBlocklistEntryDto } from "./dto";

/** §5.10 `blocklist_entries`, moved up to M5 since §6.5's default-active rule 1 and §6.6's risk signal 1 both need it now. */
@Injectable()
export class BlocklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.blocklistEntry.findMany({ orderBy: { createdAt: "desc" } });
  }

  async create(dto: CreateBlocklistEntryDto, actor: AuthenticatedStaff) {
    const entry = await this.prisma.blocklistEntry.create({ data: { ...dto, createdBy: actor.id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "blocklist.create", entityType: "blocklist_entry", entityId: entry.id, after: entry });
    return entry;
  }

  async remove(id: string, actor: AuthenticatedStaff): Promise<void> {
    const before = await this.prisma.blocklistEntry.findUnique({ where: { id } });
    await this.prisma.blocklistEntry.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "blocklist.delete", entityType: "blocklist_entry", entityId: id, before });
  }

  /** Checked at checkout (§6.5 rule 1, §6.6 signal 1) — any non-expired match on phone, IP, or device blocks/flags the order. */
  async findMatch(values: { phone?: string | null; ip?: string | null; device?: string | null }): Promise<boolean> {
    const now = new Date();
    const candidates = [
      values.phone ? { type: "phone" as const, value: values.phone } : null,
      values.ip ? { type: "ip" as const, value: values.ip } : null,
      values.device ? { type: "device" as const, value: values.device } : null,
    ].filter((c): c is { type: "phone" | "ip" | "device"; value: string } => c !== null);
    if (candidates.length === 0) return false;

    const match = await this.prisma.blocklistEntry.findFirst({
      where: {
        OR: candidates.map((c) => ({ type: c.type, value: c.value })),
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
    });
    return !!match;
  }
}
