import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateSearchSynonymDto, UpdateSearchSynonymDto } from "./dto";

@Injectable()
export class SearchSynonymsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return await this.prisma.searchSynonym.findMany({ orderBy: { term: "asc" } });
  }

  async create(dto: CreateSearchSynonymDto, actor: AuthenticatedStaff) {
    const existing = await this.prisma.searchSynonym.findUnique({ where: { term: dto.term } });
    if (existing) throw new BadRequestException({ code: "SYNONYM_TERM_TAKEN", message: `"${dto.term}" already has a synonym entry` });

    const synonym = await this.prisma.searchSynonym.create({ data: { term: dto.term, synonyms: dto.synonyms } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "search_synonym.create", entityType: "search_synonym", entityId: synonym.id, after: { term: dto.term, synonyms: dto.synonyms } });
    return synonym;
  }

  async update(id: string, dto: UpdateSearchSynonymDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.searchSynonym.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Synonym entry not found");

    const synonym = await this.prisma.searchSynonym.update({
      where: { id },
      data: { ...(dto.term !== undefined ? { term: dto.term } : {}), ...(dto.synonyms !== undefined ? { synonyms: dto.synonyms } : {}) },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "search_synonym.update", entityType: "search_synonym", entityId: id, before: { synonyms: before.synonyms }, after: { synonyms: synonym.synonyms } });
    return synonym;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.prisma.searchSynonym.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Synonym entry not found");
    await this.prisma.searchSynonym.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "search_synonym.delete", entityType: "search_synonym", entityId: id, before: { term: before.term } });
  }
}
