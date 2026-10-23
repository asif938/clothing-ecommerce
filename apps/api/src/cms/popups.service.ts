import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RevalidationService } from "../revalidation/revalidation.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreatePopupDto, UpdatePopupDto } from "./dto";

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

@Injectable()
export class PopupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  async list() {
    return await this.prisma.popup.findMany({ orderBy: { createdAt: "desc" } });
  }

  /** Public: active now, within its schedule window — the storefront decides when to actually show it (delay/exit-intent) client-side. */
  async listActiveNow() {
    const now = new Date();
    const popups = await this.prisma.popup.findMany({ where: { isActive: true } });
    return popups.filter((popup) => (!popup.startsAt || popup.startsAt <= now) && (!popup.endsAt || popup.endsAt >= now));
  }

  async create(dto: CreatePopupDto, actor: AuthenticatedStaff) {
    const popup = await this.prisma.popup.create({
      data: {
        name: dto.name,
        title: dto.title,
        body: dto.body,
        imageMediaId: dto.imageMediaId ?? null,
        ctaText: toJsonInput(dto.ctaText),
        ctaUrl: dto.ctaUrl ?? null,
        trigger: dto.trigger ?? "delay",
        delaySeconds: dto.delaySeconds ?? 3,
        startsAt: dto.startsAt ?? null,
        endsAt: dto.endsAt ?? null,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "popup.create", entityType: "popup", entityId: popup.id, after: { name: dto.name } });
    await this.revalidation.revalidate(["popups"]);
    return popup;
  }

  async update(id: string, dto: UpdatePopupDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.popup.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Popup not found");

    const popup = await this.prisma.popup.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.imageMediaId !== undefined ? { imageMediaId: dto.imageMediaId } : {}),
        ...(dto.ctaText !== undefined ? { ctaText: toJsonInput(dto.ctaText) } : {}),
        ...(dto.ctaUrl !== undefined ? { ctaUrl: dto.ctaUrl } : {}),
        ...(dto.trigger !== undefined ? { trigger: dto.trigger } : {}),
        ...(dto.delaySeconds !== undefined ? { delaySeconds: dto.delaySeconds } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "popup.update", entityType: "popup", entityId: id, before: { name: before.name } });
    await this.revalidation.revalidate(["popups"]);
    return popup;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.prisma.popup.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Popup not found");
    await this.prisma.popup.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "popup.delete", entityType: "popup", entityId: id, before: { name: before.name } });
    await this.revalidation.revalidate(["popups"]);
  }
}
