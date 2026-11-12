import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, ShipmentStatus } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { CourierProvidersService } from "../couriers/courier-providers.service";
import { parseWorkbookRows } from "../import-export/workbook";
import { isUniqueViolation } from "../common/document-number";
import type { AuthenticatedStaff } from "../common/types";
import { matchCodLine, parseSettlementRows, settlementTotals, type MatchableShipment, type ParsedSettlementLine } from "./cod-matching";
import type { ConfirmCodSettlementDto, FetchCodApiDto, ImportCodFileDto, InspectFileDto, ListCodSettlementsQueryDto, UpdateCodLineDto } from "./dto";

const SETTLEABLE: ShipmentStatus[] = ["delivered", "partially_delivered", "rejected_at_door", "returned_to_sender"];
const SHIPMENT_SELECT = { id: true, status: true, codAmount: true, deliveryFeeCollected: true, codSettledAt: true, consignmentId: true, trackingCode: true } as const;

/** Lines that are safe to post to their shipment on confirm. */
function isPostable(line: { matched: boolean; flag: string | null; shipmentId: string | null }): boolean {
  return line.matched && line.shipmentId !== null && line.flag !== "duplicate" && line.flag !== "already_settled";
}

/**
 * COD reconciliation (docs/PROJECT_SPEC.md §8.2 Finance, §10.6
 * `cod_settlements`, §16 M12). A settlement is created as a *draft* from a
 * courier settlement file (CSV/XLSX, staff map the columns) or from the
 * courier's API where the driver supports it; every line is auto-matched to
 * a shipment by consignment id (falling back to tracking code) and flagged
 * (see `matchCodLine`). Confirming posts each clean/variance line to its
 * shipment: `codSettledAt`, `codSettledAmount`, and the courier's charge as
 * `deliveryChargeActual` — which is what the true profit report then uses
 * instead of an estimate.
 */
@Injectable()
export class CodSettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly couriers: CourierProvidersService,
  ) {}

  /** Reads an uploaded file's header row and first rows so staff can map columns before importing. */
  inspect(dto: InspectFileDto) {
    const rows = this.readRows(dto.fileName, dto.contentBase64);
    return { headers: rows[0] ? Object.keys(rows[0]) : [], rowCount: rows.length, sample: rows.slice(0, 5) };
  }

  private readRows(fileName: string, contentBase64: string): Record<string, unknown>[] {
    const lower = fileName.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      throw new BadRequestException({ code: "UNSUPPORTED_FILE", message: "Upload a .csv, .xlsx or .xls file" });
    }
    try {
      return parseWorkbookRows(Buffer.from(contentBase64, "base64"), fileName);
    } catch {
      throw new BadRequestException({ code: "UNREADABLE_FILE", message: "Couldn't read that file" });
    }
  }

  async list(query: ListCodSettlementsQueryDto) {
    return this.prisma.codSettlement.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { _count: { select: { lines: true } } },
    });
  }

  async get(id: string) {
    const settlement = await this.prisma.codSettlement.findUnique({
      where: { id },
      include: { lines: { orderBy: [{ flag: { sort: "desc", nulls: "last" } }, { consignmentId: "asc" }], include: { shipment: { select: { id: true, status: true, codAmount: true, order: { select: { id: true, orderNumber: true } } } } } } },
    });
    if (!settlement) throw new NotFoundException({ code: "COD_SETTLEMENT_NOT_FOUND", message: "Settlement not found" });
    return { ...settlement, summary: settlementTotals(settlement.lines) };
  }

  /** Matches parsed lines against shipments in one batched lookup. */
  private async matchLines(lines: ParsedSettlementLine[], excludeSettlementId?: string) {
    const tolerance = await this.settings.getValue<number>("finance.codVarianceTolerance");
    const ids = [...new Set(lines.map((l) => l.consignmentId))];
    const shipments = ids.length
      ? await this.prisma.shipment.findMany({ where: { OR: [{ consignmentId: { in: ids } }, { trackingCode: { in: ids } }] }, select: SHIPMENT_SELECT })
      : [];
    const byKey = new Map<string, MatchableShipment>();
    for (const s of shipments) {
      if (s.trackingCode) byKey.set(s.trackingCode, s);
      if (s.consignmentId) byKey.set(s.consignmentId, s); // consignment id wins over a colliding tracking code
    }
    // A shipment that's already in *another* draft settlement isn't
    // "settled" yet, but matching it twice would double-post on confirm.
    const inOtherDrafts = shipments.length
      ? new Set(
          (
            await this.prisma.codSettlementLine.findMany({
              where: { shipmentId: { in: shipments.map((s) => s.id) }, settlement: { status: "draft", ...(excludeSettlementId ? { id: { not: excludeSettlementId } } : {}) } },
              select: { shipmentId: true },
            })
          ).map((l) => l.shipmentId),
        )
      : new Set<string | null>();

    const seen = new Set<string>();
    return lines.map((line) => {
      const shipment = byKey.get(line.consignmentId) ?? null;
      const key = shipment?.id ?? `c:${line.consignmentId}`;
      const match = matchCodLine(line, shipment, seen.has(key) || (shipment !== null && inOtherDrafts.has(shipment.id)), tolerance);
      seen.add(key);
      return { ...line, ...match };
    });
  }

  private async createSettlement(
    data: { courierProviderInstanceId: string | null; courierDriver: string; settlementRef: string | null; periodFrom: Date | null; periodTo: Date | null; source: string; fileName: string | null; note: string | null },
    lines: ParsedSettlementLine[],
    actor: AuthenticatedStaff,
  ) {
    if (lines.length === 0) throw new BadRequestException({ code: "NO_LINES", message: "Nothing to import — no rows had a consignment id and amount" });
    const matched = await this.matchLines(lines);
    const totals = settlementTotals(matched);
    let settlement;
    try {
      settlement = await this.prisma.codSettlement.create({
        data: {
          ...data,
          totalCollected: totals.totalCollected,
          totalCharges: totals.totalCharges,
          netAmount: totals.netAmount,
          createdBy: actor.id,
          lines: {
            create: matched.map((l) => ({ consignmentId: l.consignmentId, collected: l.collected, charge: l.charge, shipmentId: l.shipmentId, expected: l.expected, matched: l.matched, variance: l.variance, flag: l.flag })),
          },
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new BadRequestException({ code: "SETTLEMENT_EXISTS", message: "A settlement with this reference was already imported for this courier" });
      throw error;
    }
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "cod_settlement.import", entityType: "cod_settlement", entityId: settlement.id, after: { source: data.source, fileName: data.fileName, lines: lines.length, ...totals } });
    return this.get(settlement.id);
  }

  async importFile(dto: ImportCodFileDto, actor: AuthenticatedStaff) {
    let courierDriver = dto.courierDriver;
    if (dto.courierProviderInstanceId) {
      const instance = await this.prisma.providerInstance.findUnique({ where: { id: dto.courierProviderInstanceId } });
      if (!instance || instance.capability !== "courier") throw new BadRequestException({ code: "COURIER_NOT_CONFIGURED", message: "That courier isn't configured" });
      courierDriver = instance.driver;
    }
    const parsed = parseSettlementRows(this.readRows(dto.fileName, dto.contentBase64), dto.mapping);
    if (parsed.errors.length > 0 && parsed.lines.length === 0) {
      throw new BadRequestException({ code: "IMPORT_ERRORS", message: "No row could be read — check the column mapping", details: parsed.errors.slice(0, 50) });
    }
    const result = await this.createSettlement(
      {
        courierProviderInstanceId: dto.courierProviderInstanceId ?? null,
        courierDriver,
        settlementRef: dto.settlementRef ?? null,
        periodFrom: dto.periodFrom ?? null,
        periodTo: dto.periodTo ?? null,
        source: "file",
        fileName: dto.fileName,
        note: dto.note ?? null,
      },
      parsed.lines,
      actor,
    );
    return { ...result, importErrors: parsed.errors };
  }

  /** Asks the courier's API for payouts on every final, not-yet-settled shipment booked with that courier. */
  async fetchFromApi(dto: FetchCodApiDto, actor: AuthenticatedStaff) {
    const { driver, driverName } = await this.couriers.resolveDriver(dto.courierProviderInstanceId);
    if (!driver.getCodSettlement) {
      throw new BadRequestException({ code: "NOT_SUPPORTED", message: `The ${driverName} driver has no settlement API — import the courier's settlement file instead` });
    }
    const shipments = await this.prisma.shipment.findMany({
      where: { courierProviderInstanceId: dto.courierProviderInstanceId, status: { in: SETTLEABLE }, codSettledAt: null, consignmentId: { not: null } },
      select: { consignmentId: true, codAmount: true },
      take: 2000,
    });
    if (shipments.length === 0) throw new BadRequestException({ code: "NOTHING_TO_SETTLE", message: "No delivered or returned shipments are waiting for settlement with this courier" });
    const lines = await driver.getCodSettlement(shipments.map((s) => ({ consignmentId: s.consignmentId!, expectedCod: s.codAmount })));
    return this.createSettlement(
      {
        courierProviderInstanceId: dto.courierProviderInstanceId,
        courierDriver: driverName,
        settlementRef: dto.settlementRef ?? `api-${new Date().toISOString().slice(0, 16)}`,
        periodFrom: null,
        periodTo: null,
        source: "api",
        fileName: null,
        note: dto.note ?? null,
      },
      lines.map((l) => ({ consignmentId: l.consignmentId, collected: l.collected, charge: l.charge })),
      actor,
    );
  }

  private async assertDraft(id: string) {
    const settlement = await this.prisma.codSettlement.findUnique({ where: { id }, select: { status: true } });
    if (!settlement) throw new NotFoundException({ code: "COD_SETTLEMENT_NOT_FOUND", message: "Settlement not found" });
    if (settlement.status !== "draft") throw new BadRequestException({ code: "SETTLEMENT_CONFIRMED", message: "This settlement is already confirmed" });
  }

  /** Re-runs matching on a draft (e.g. after shipments were updated or a missing booking was entered). */
  async rematch(id: string, actor: AuthenticatedStaff) {
    await this.assertDraft(id);
    const lines = await this.prisma.codSettlementLine.findMany({ where: { settlementId: id }, orderBy: { id: "asc" } });
    const matched = await this.matchLines(lines, id);
    await this.prisma.$transaction(
      lines.map((line, i) => {
        const m = matched[i]!;
        return this.prisma.codSettlementLine.update({ where: { id: line.id }, data: { shipmentId: m.shipmentId, expected: m.expected, matched: m.matched, variance: m.variance, flag: m.flag } });
      }),
    );
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "cod_settlement.rematch", entityType: "cod_settlement", entityId: id });
    return this.get(id);
  }

  /** Manual match / note on one line of a draft. */
  async updateLine(id: string, lineId: string, dto: UpdateCodLineDto, actor: AuthenticatedStaff) {
    await this.assertDraft(id);
    const line = await this.prisma.codSettlementLine.findFirst({ where: { id: lineId, settlementId: id } });
    if (!line) throw new NotFoundException({ code: "LINE_NOT_FOUND", message: "Line not found" });

    const data: Prisma.CodSettlementLineUncheckedUpdateInput = {};
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.shipmentId !== undefined) {
      if (dto.shipmentId === null) {
        Object.assign(data, { shipmentId: null, matched: false, expected: null, variance: 0, flag: "unmatched" });
      } else {
        const shipment = await this.prisma.shipment.findUnique({ where: { id: dto.shipmentId }, select: SHIPMENT_SELECT });
        if (!shipment) throw new BadRequestException({ code: "SHIPMENT_NOT_FOUND", message: "Shipment not found" });
        const tolerance = await this.settings.getValue<number>("finance.codVarianceTolerance");
        const m = matchCodLine(line, shipment, false, tolerance);
        Object.assign(data, { shipmentId: m.shipmentId, matched: m.matched, expected: m.expected, variance: m.variance, flag: m.flag });
      }
    }
    await this.prisma.codSettlementLine.update({ where: { id: lineId }, data });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "cod_settlement.line_update", entityType: "cod_settlement", entityId: id, before: { shipmentId: line.shipmentId, note: line.note }, after: dto });
    return this.get(id);
  }

  async confirm(id: string, dto: ConfirmCodSettlementDto, actor: AuthenticatedStaff) {
    const posted = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.codSettlement.updateMany({
        where: { id, status: "draft" },
        data: { status: "confirmed", confirmedBy: actor.id, confirmedAt: new Date(), receivedAmount: dto.receivedAmount ?? null, receivedAt: dto.receivedAt ?? new Date(), ...(dto.note !== undefined ? { note: dto.note } : {}) },
      });
      if (count === 0) throw new BadRequestException({ code: "SETTLEMENT_CONFIRMED", message: "This settlement is already confirmed" });
      const lines = await tx.codSettlementLine.findMany({ where: { settlementId: id } });
      let postedLines = 0;
      for (const line of lines.filter(isPostable)) {
        // `codSettledAt: null` guard: never double-post a shipment that another settlement confirmed meanwhile.
        const { count: updated } = await tx.shipment.updateMany({
          where: { id: line.shipmentId!, codSettledAt: null },
          data: { codSettledAt: new Date(), codSettledAmount: line.collected, ...(line.charge > 0 ? { deliveryChargeActual: line.charge } : {}) },
        });
        if (updated === 0) await tx.codSettlementLine.update({ where: { id: line.id }, data: { flag: "already_settled" } });
        else postedLines += 1;
      }
      return postedLines;
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "cod_settlement.confirm", entityType: "cod_settlement", entityId: id, after: { postedLines: posted, receivedAmount: dto.receivedAmount ?? null } });
    return this.get(id);
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const { count } = await this.prisma.codSettlement.deleteMany({ where: { id, status: "draft" } });
    if (count === 0) throw new BadRequestException({ code: "SETTLEMENT_CONFIRMED", message: "Only a draft settlement can be deleted" });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "cod_settlement.delete", entityType: "cod_settlement", entityId: id });
  }

  /** COD money still out with couriers: final shipments with a COD amount and no confirmed settlement, grouped by courier. Feeds the dashboard and Finance screen. */
  async outstanding() {
    const rows = await this.prisma.shipment.groupBy({
      by: ["courierDriver"],
      where: { status: { in: ["delivered", "partially_delivered"] }, codSettledAt: null, codAmount: { gt: 0 } },
      _sum: { codAmount: true },
      _count: { _all: true },
      _min: { deliveredAt: true },
    });
    return rows.map((r) => ({ courierDriver: r.courierDriver, shipments: r._count._all, amount: r._sum.codAmount ?? 0, oldestDeliveredAt: r._min.deliveredAt }));
  }
}
