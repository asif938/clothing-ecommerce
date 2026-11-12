import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { SupplierDto, UpdateSupplierDto } from "./dto";

/** §5.4 `suppliers` (§16 M12). */
@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const suppliers = await this.prisma.supplier.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], include: { _count: { select: { purchaseOrders: true } } } });
    return suppliers.map(({ _count, ...supplier }) => ({ ...supplier, purchaseOrderCount: _count.purchaseOrders }));
  }

  async get(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException({ code: "SUPPLIER_NOT_FOUND", message: "Supplier not found" });
    return supplier;
  }

  async create(dto: SupplierDto, actor: AuthenticatedStaff) {
    const supplier = await this.prisma.supplier.create({ data: { ...dto, email: dto.email ?? null } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "supplier.create", entityType: "supplier", entityId: supplier.id, after: supplier });
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const supplier = await this.prisma.supplier.update({ where: { id }, data: dto });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "supplier.update", entityType: "supplier", entityId: id, before, after: supplier });
    return supplier;
  }

  /** Suppliers with purchase-order history are deactivated, not deleted, so old POs stay readable. */
  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const poCount = await this.prisma.purchaseOrder.count({ where: { supplierId: id } });
    if (poCount > 0) throw new BadRequestException({ code: "SUPPLIER_IN_USE", message: "This supplier has purchase orders — deactivate it instead." });
    await this.prisma.supplier.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "supplier.delete", entityType: "supplier", entityId: id, before });
  }
}
