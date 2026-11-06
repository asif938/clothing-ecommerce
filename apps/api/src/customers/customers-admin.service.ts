import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { BlocklistService } from "../blocklist/blocklist.service";
import type { AuthenticatedStaff } from "../common/types";
import { SegmentsService } from "./segments.service";
import type { AnonymizeCustomerDto, BlockCustomerDto, ListCustomersQueryDto, UpdateCustomerDto } from "./dto";

/**
 * Admin customer list/profile (docs/PROJECT_SPEC.md §8.2 "Customers"). The
 * loyalty points/credit *ledger* (transactions, not just the running
 * balance already on `Customer`) isn't built before M12/M13 (§5.8) — the
 * profile shows the current `pointsBalance`/`storeCreditBalance` fields as
 * read-only, documented as a real gap, not a silent one (see
 * docs/DECISIONS.md).
 */
@Injectable()
export class CustomersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly blocklist: BlocklistService,
    private readonly segments: SegmentsService,
  ) {}

  async list(query: ListCustomersQueryDto) {
    const where: Prisma.CustomerWhereInput = { deletedAt: null };
    if (query.search) {
      where.OR = [{ phone: { contains: query.search } }, { name: { contains: query.search, mode: "insensitive" } }, { email: { contains: query.search, mode: "insensitive" } }];
    }
    if (query.minSpent !== undefined) where.totalSpent = { gte: query.minSpent };
    if (query.minOrders !== undefined) where.ordersCount = { gte: query.minOrders };
    if (query.tag) where.tags = { has: query.tag };
    if (query.status) where.status = query.status;
    if (query.minRiskScore !== undefined) where.riskScore = { gte: query.minRiskScore };
    if (query.segmentId) {
      const segment = await this.segments.get(query.segmentId);
      Object.assign(where, this.segments.whereFor(segment));
    }

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getProfile(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id, deletedAt: null } });
    if (!customer) throw new NotFoundException("Customer not found");

    const [orders, addresses, reviews, returns] = await Promise.all([
      this.prisma.order.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, orderNumber: true, status: true, total: true, createdAt: true } }),
      this.prisma.address.findMany({ where: { customerId: id } }),
      this.prisma.review.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
      this.prisma.return.findMany({ where: { order: { customerId: id } }, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);

    return { customer, orders, addresses, reviews, returns };
  }

  async update(id: string, dto: UpdateCustomerDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Customer not found");
    const customer = await this.prisma.customer.update({ where: { id }, data: dto });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "customer.update", entityType: "customer", entityId: id, before, after: customer });
    return customer;
  }

  /** Shortcut onto the existing blocklist module (§8.2 "blocklist action" on the profile) — blocks the customer's own phone number, same effect as adding it from the Blocklist screen directly. */
  async block(id: string, dto: BlockCustomerDto, actor: AuthenticatedStaff) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException("Customer not found");
    if (customer.phone) {
      await this.blocklist.create({ type: "phone", value: customer.phone, reason: dto.reason }, actor);
    }
    const updated = await this.prisma.customer.update({ where: { id }, data: { status: "blocked" } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "customer.block", entityType: "customer", entityId: id, after: { status: "blocked", reason: dto.reason } });
    return updated;
  }

  /**
   * §8.2 "merge duplicates" — generalizes the Google/phone merge
   * `CustomersService` built in M5 for exactly one duplicate cause; the
   * underlying move-everything-then-soft-delete logic is identical
   * regardless of *why* two customer rows turned out to be the same
   * person, so this just calls it with admin-chosen ids instead of
   * auth-flow-chosen ones.
   */
  async merge(keepCustomerId: string, mergeCustomerId: string, actor: AuthenticatedStaff): Promise<void> {
    if (keepCustomerId === mergeCustomerId) throw new Error("Cannot merge a customer into itself");
    await this.prisma.$transaction([
      this.prisma.address.updateMany({ where: { customerId: mergeCustomerId }, data: { customerId: keepCustomerId } }),
      this.prisma.order.updateMany({ where: { customerId: mergeCustomerId }, data: { customerId: keepCustomerId } }),
      this.prisma.cart.updateMany({ where: { customerId: mergeCustomerId }, data: { customerId: keepCustomerId } }),
      this.prisma.review.updateMany({ where: { customerId: mergeCustomerId }, data: { customerId: keepCustomerId } }),
      this.prisma.customer.update({ where: { id: mergeCustomerId }, data: { deletedAt: new Date() } }),
    ]);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "customer.merge", entityType: "customer", entityId: keepCustomerId, after: { mergedFrom: mergeCustomerId } });
  }

  /**
   * §12 "customer data export ... on request (admin action)". A sensitive
   * read, so it's audit-logged like one even though nothing is mutated —
   * the admin is handing this bundle to the customer (or to a regulator).
   */
  async exportData(id: string, actor: AuthenticatedStaff) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException("Customer not found");

    const [orders, addresses, reviews, returns] = await Promise.all([
      this.prisma.order.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, include: { items: true } }),
      this.prisma.address.findMany({ where: { customerId: id } }),
      this.prisma.review.findMany({ where: { customerId: id } }),
      this.prisma.return.findMany({ where: { order: { customerId: id } } }),
    ]);

    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "customer.privacy_export", entityType: "customer", entityId: id });
    return { customer, orders, addresses, reviews, returns, exportedAt: new Date().toISOString() };
  }

  /**
   * §12 "deletion on request ... orders anonymized, not deleted, for
   * accounting". Scrubs PII on the customer row and on every one of their
   * orders' own embedded contact snapshots (orders aren't FK-cascaded away
   * by design — their totals/items stay for bookkeeping). `deletedAt`
   * doubles as the "this identity no longer exists" marker, same as
   * `merge()` already uses it.
   */
  async anonymize(id: string, dto: AnonymizeCustomerDto, actor: AuthenticatedStaff): Promise<void> {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException("Customer not found");

    await this.prisma.$transaction([
      this.prisma.customer.update({
        where: { id },
        data: {
          name: null,
          email: null,
          phone: null,
          googleId: null,
          gender: null,
          birthday: null,
          notes: null,
          tags: [],
          marketingConsentSms: false,
          marketingConsentEmail: false,
          marketingConsentWhatsapp: false,
          deletedAt: new Date(),
        },
      }),
      this.prisma.order.updateMany({
        where: { customerId: id },
        data: {
          billingContact: { anonymized: true },
          shippingAddress: { anonymized: true },
          customerNote: null,
          ip: null,
          userAgent: null,
          deviceId: null,
        },
      }),
      this.prisma.address.deleteMany({ where: { customerId: id } }),
    ]);

    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "customer.anonymize",
      entityType: "customer",
      entityId: id,
      after: { reason: dto.reason ?? null },
    });
  }
}
