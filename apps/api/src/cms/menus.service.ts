import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RevalidationService } from "../revalidation/revalidation.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateMenuDto, UpdateMenuDto } from "./dto";

@Injectable()
export class MenusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  async list() {
    return await this.prisma.menu.findMany({ orderBy: { key: "asc" } });
  }

  async getByKey(key: string) {
    return await this.prisma.menu.findUnique({ where: { key } });
  }

  async create(dto: CreateMenuDto, actor: AuthenticatedStaff) {
    const existing = await this.prisma.menu.findUnique({ where: { key: dto.key } });
    if (existing) throw new BadRequestException({ code: "MENU_KEY_TAKEN", message: `Menu key "${dto.key}" already exists` });

    const menu = await this.prisma.menu.create({ data: { key: dto.key, name: dto.name, items: dto.items as unknown as Prisma.InputJsonValue } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "menu.create", entityType: "menu", entityId: menu.id, after: { key: dto.key } });
    await this.revalidation.revalidate(["menus", `menu:${dto.key}`]);
    return menu;
  }

  async update(id: string, dto: UpdateMenuDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.menu.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Menu not found");

    const menu = await this.prisma.menu.update({
      where: { id },
      data: { ...(dto.name !== undefined ? { name: dto.name } : {}), ...(dto.items !== undefined ? { items: dto.items as unknown as Prisma.InputJsonValue } : {}) },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "menu.update", entityType: "menu", entityId: id, before: { name: before.name }, after: { name: menu.name } });
    await this.revalidation.revalidate(["menus", `menu:${before.key}`]);
    return menu;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.prisma.menu.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Menu not found");
    await this.prisma.menu.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "menu.delete", entityType: "menu", entityId: id, before: { key: before.key } });
    await this.revalidation.revalidate(["menus", `menu:${before.key}`]);
  }
}
