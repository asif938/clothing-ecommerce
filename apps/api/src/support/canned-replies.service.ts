import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@clothing/db";
import { t } from "@clothing/shared";
import { renderCannedReply } from "@clothing/shared/support";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { isUniqueViolation } from "../common/document-number";
import type { AuthenticatedStaff } from "../common/types";
import type { CannedReplyDto } from "./dto";

const ENTITY = "canned_reply";

/** Canned replies (§8.2 Support) — bilingual bodies with `{variable}` placeholders, inserted with "/shortcut" in the composer. */
@Injectable()
export class CannedRepliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  list(q?: string) {
    return this.prisma.cannedReply.findMany({
      where: q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { shortcut: { contains: q, mode: "insensitive" } }] } : {},
      orderBy: [{ usageCount: "desc" }, { title: "asc" }],
    });
  }

  private async find(id: string) {
    const row = await this.prisma.cannedReply.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Canned reply not found");
    return row;
  }

  async create(dto: CannedReplyDto, actor: AuthenticatedStaff) {
    try {
      const row = await this.prisma.cannedReply.create({ data: { title: dto.title, shortcut: dto.shortcut, body: dto.body as Prisma.InputJsonValue, category: dto.category ?? null, createdBy: actor.id } });
      await this.audit.record({ actorType: "staff", actorId: actor.id, action: "canned_reply.create", entityType: ENTITY, entityId: row.id, after: row });
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) throw new BadRequestException({ code: "SHORTCUT_TAKEN", message: `"/${dto.shortcut}" is already used.` });
      throw error;
    }
  }

  async update(id: string, dto: Partial<CannedReplyDto>, actor: AuthenticatedStaff) {
    const before = await this.find(id);
    try {
      const after = await this.prisma.cannedReply.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.shortcut !== undefined ? { shortcut: dto.shortcut } : {}),
          ...(dto.body !== undefined ? { body: dto.body as Prisma.InputJsonValue } : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
        },
      });
      await this.audit.record({ actorType: "staff", actorId: actor.id, action: "canned_reply.update", entityType: ENTITY, entityId: id, before, after });
      return after;
    } catch (error) {
      if (isUniqueViolation(error)) throw new BadRequestException({ code: "SHORTCUT_TAKEN", message: `"/${dto.shortcut}" is already used.` });
      throw error;
    }
  }

  async remove(id: string, actor: AuthenticatedStaff): Promise<void> {
    const before = await this.find(id);
    await this.prisma.cannedReply.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "canned_reply.delete", entityType: ENTITY, entityId: id, before });
  }

  /** The reply text for one conversation, variables filled; counts as a use. */
  async render(id: string, conversationId: string | null, locale: "bn" | "en", staffName: string) {
    const row = await this.find(id);
    const conversation = conversationId ? await this.prisma.conversation.findUnique({ where: { id: conversationId } }) : null;
    const lastOrder = conversation?.orderIds.length
      ? await this.prisma.order.findUnique({ where: { id: conversation.orderIds[conversation.orderIds.length - 1]! }, select: { orderNumber: true } })
      : null;
    const [brand, phone] = await Promise.all([this.settings.getValue<{ bn?: string; en?: string }>("brand.name"), this.settings.getValue<string | null>("brand.phone").catch(() => null)]);
    const text = renderCannedReply(t(row.body as { bn?: string; en?: string }, locale), {
      customer_name: conversation?.contactName ?? "",
      order_number: lastOrder?.orderNumber ?? null,
      brand_name: t(brand, locale),
      support_phone: typeof phone === "string" ? phone : "",
      agent_name: staffName,
    });
    await this.prisma.cannedReply.update({ where: { id }, data: { usageCount: { increment: 1 } } });
    return { text };
  }
}
