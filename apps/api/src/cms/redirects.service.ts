import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateRedirectDto, UpdateRedirectDto } from "./dto";

@Injectable()
export class RedirectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return await this.prisma.redirect.findMany({ orderBy: { createdAt: "desc" } });
  }

  /** Public: looked up by the storefront's catch-all page when no CMS page/product/category matches a path. */
  async findActiveByFromPath(fromPath: string) {
    const redirect = await this.prisma.redirect.findUnique({ where: { fromPath } });
    return redirect && redirect.isActive ? redirect : null;
  }

  async create(dto: CreateRedirectDto, actor: AuthenticatedStaff) {
    const existing = await this.prisma.redirect.findUnique({ where: { fromPath: dto.fromPath } });
    if (existing) throw new BadRequestException({ code: "REDIRECT_EXISTS", message: `A redirect from "${dto.fromPath}" already exists` });

    const redirect = await this.prisma.redirect.create({
      data: { fromPath: dto.fromPath, toPath: dto.toPath, statusCode: dto.statusCode ?? 301, isActive: dto.isActive ?? true },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "redirect.create", entityType: "redirect", entityId: redirect.id, after: { fromPath: dto.fromPath, toPath: dto.toPath } });
    return redirect;
  }

  async update(id: string, dto: UpdateRedirectDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.redirect.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Redirect not found");

    const redirect = await this.prisma.redirect.update({
      where: { id },
      data: {
        ...(dto.fromPath !== undefined ? { fromPath: dto.fromPath } : {}),
        ...(dto.toPath !== undefined ? { toPath: dto.toPath } : {}),
        ...(dto.statusCode !== undefined ? { statusCode: dto.statusCode } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "redirect.update", entityType: "redirect", entityId: id, before: { toPath: before.toPath } });
    return redirect;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.prisma.redirect.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Redirect not found");
    await this.prisma.redirect.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "redirect.delete", entityType: "redirect", entityId: id, before: { fromPath: before.fromPath } });
  }
}
