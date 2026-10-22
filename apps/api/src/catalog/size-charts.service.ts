import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MediaUsageService } from "../media/media-usage.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateSizeChartDto, UpdateSizeChartDto } from "./dto";

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function howToMeasureMediaId(howToMeasure: unknown): string | null {
  if (!howToMeasure || typeof howToMeasure !== "object") return null;
  const imageMediaId = (howToMeasure as { imageMediaId?: unknown }).imageMediaId;
  return typeof imageMediaId === "string" ? imageMediaId : null;
}

@Injectable()
export class SizeChartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mediaUsage: MediaUsageService,
  ) {}

  async list() {
    return await this.prisma.sizeChart.findMany({ orderBy: { createdAt: "asc" } });
  }

  async get(id: string) {
    const chart = await this.prisma.sizeChart.findUnique({ where: { id } });
    if (!chart) throw new NotFoundException("Size chart not found");
    return chart;
  }

  async create(dto: CreateSizeChartDto, actor: AuthenticatedStaff) {
    const chart = await this.prisma.sizeChart.create({
      data: {
        name: dto.name,
        unitDefault: dto.unitDefault ?? "cm",
        columns: dto.columns,
        rows: dto.rows,
        howToMeasure: toJsonInput(dto.howToMeasure),
        notes: toJsonInput(dto.notes),
      },
    });
    await this.mediaUsage.sync("size_chart", chart.id, [howToMeasureMediaId(chart.howToMeasure)]);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "size_chart.create", entityType: "size_chart", entityId: chart.id, after: { name: dto.name } });
    return chart;
  }

  async update(id: string, dto: UpdateSizeChartDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const chart = await this.prisma.sizeChart.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.unitDefault !== undefined ? { unitDefault: dto.unitDefault } : {}),
        ...(dto.columns !== undefined ? { columns: dto.columns } : {}),
        ...(dto.rows !== undefined ? { rows: dto.rows } : {}),
        ...(dto.howToMeasure !== undefined ? { howToMeasure: toJsonInput(dto.howToMeasure) } : {}),
        ...(dto.notes !== undefined ? { notes: toJsonInput(dto.notes) } : {}),
      },
    });
    await this.mediaUsage.sync("size_chart", chart.id, [howToMeasureMediaId(chart.howToMeasure)]);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "size_chart.update", entityType: "size_chart", entityId: id, before: { name: before.name }, after: { name: chart.name } });
    return chart;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const [categoryCount, productCount] = await Promise.all([
      this.prisma.category.count({ where: { sizeChartId: id } }),
      this.prisma.product.count({ where: { sizeChartId: id } }),
    ]);
    if (categoryCount > 0 || productCount > 0) {
      throw new BadRequestException({ code: "SIZE_CHART_IN_USE", message: "Remove it from categories/products first" });
    }
    await this.prisma.sizeChart.delete({ where: { id } });
    await this.mediaUsage.clear("size_chart", id);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "size_chart.delete", entityType: "size_chart", entityId: id, before: { name: before.name } });
  }
}
