import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RevalidationService } from "../revalidation/revalidation.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateAnnouncementDto, UpdateAnnouncementDto } from "./dto";

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  async list() {
    return await this.prisma.announcementBar.findMany({ orderBy: { position: "asc" } });
  }

  /** Public: active now, within its schedule window if one is set. */
  async listActiveNow() {
    const now = new Date();
    const bars = await this.prisma.announcementBar.findMany({ where: { isActive: true }, orderBy: { position: "asc" } });
    return bars.filter((bar) => (!bar.startsAt || bar.startsAt <= now) && (!bar.endsAt || bar.endsAt >= now));
  }

  async create(dto: CreateAnnouncementDto, actor: AuthenticatedStaff) {
    const bar = await this.prisma.announcementBar.create({
      data: {
        message: dto.message,
        linkUrl: dto.linkUrl ?? null,
        linkText: toJsonInput(dto.linkText),
        startsAt: dto.startsAt ?? null,
        endsAt: dto.endsAt ?? null,
        isActive: dto.isActive ?? true,
        position: dto.position ?? 0,
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "announcement.create", entityType: "announcement_bar", entityId: bar.id });
    await this.revalidation.revalidate(["announcements"]);
    return bar;
  }

  async update(id: string, dto: UpdateAnnouncementDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.announcementBar.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Announcement not found");

    const bar = await this.prisma.announcementBar.update({
      where: { id },
      data: {
        ...(dto.message !== undefined ? { message: dto.message } : {}),
        ...(dto.linkUrl !== undefined ? { linkUrl: dto.linkUrl } : {}),
        ...(dto.linkText !== undefined ? { linkText: toJsonInput(dto.linkText) } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "announcement.update", entityType: "announcement_bar", entityId: id });
    await this.revalidation.revalidate(["announcements"]);
    return bar;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.prisma.announcementBar.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Announcement not found");
    await this.prisma.announcementBar.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "announcement.delete", entityType: "announcement_bar", entityId: id });
    await this.revalidation.revalidate(["announcements"]);
  }
}
