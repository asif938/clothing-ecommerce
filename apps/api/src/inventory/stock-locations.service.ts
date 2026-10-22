import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateStockLocationDto, UpdateStockLocationDto } from "./dto";

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

@Injectable()
export class StockLocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return await this.prisma.stockLocation.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  }

  async get(id: string) {
    const location = await this.prisma.stockLocation.findUnique({ where: { id } });
    if (!location) throw new NotFoundException("Stock location not found");
    return location;
  }

  async create(dto: CreateStockLocationDto, actor: AuthenticatedStaff) {
    if (dto.isDefault) await this.prisma.stockLocation.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const location = await this.prisma.stockLocation.create({
      data: {
        name: dto.name,
        address: toJsonInput(dto.address),
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
        fulfillsOnline: dto.fulfillsOnline ?? true,
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "stock_location.create", entityType: "stock_location", entityId: location.id, after: { name: dto.name } });
    return location;
  }

  async update(id: string, dto: UpdateStockLocationDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    if (dto.isDefault) await this.prisma.stockLocation.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });

    const location = await this.prisma.stockLocation.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.address !== undefined ? { address: toJsonInput(dto.address) } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.fulfillsOnline !== undefined ? { fulfillsOnline: dto.fulfillsOnline } : {}),
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "stock_location.update", entityType: "stock_location", entityId: id, before: { name: before.name }, after: { name: location.name } });
    return location;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const levelCount = await this.prisma.inventoryLevel.count({ where: { locationId: id, onHand: { gt: 0 } } });
    if (levelCount > 0) throw new BadRequestException({ code: "LOCATION_HAS_STOCK", message: "Move or zero out its stock first" });
    await this.prisma.stockLocation.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "stock_location.delete", entityType: "stock_location", entityId: id, before: { name: before.name } });
  }
}
