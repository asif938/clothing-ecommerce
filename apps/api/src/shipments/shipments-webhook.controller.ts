import { Body, Controller, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { pathaoStatusMap, redxStatusMap, steadfastStatusMap, type ShipmentStatusValue } from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { ShipmentsService } from "./shipments.service";

const STATUS_MAPS: Record<string, Record<string, ShipmentStatusValue>> = {
  steadfast: steadfastStatusMap,
  pathao: pathaoStatusMap,
  redx: redxStatusMap,
};

// Field names vary by driver and aren't verified against a real sandbox
// payload yet (§10: "no merchant accounts exist yet" — see
// docs/DECISIONS.md); this accepts the documented candidates for each and
// should be tightened once a real webhook payload is on hand. No signature
// verification yet either — add it per-driver before going live.
function extractConsignmentId(driver: string, body: Record<string, unknown>): string | null {
  const candidates = driver === "redx" ? ["tracking_id", "consignment_id"] : ["consignment_id", "cid", "merchant_order_id"];
  for (const key of candidates) {
    const value = body[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

function extractRawStatus(body: Record<string, unknown>): string | null {
  for (const key of ["status", "delivery_status", "order_status"]) {
    const value = body[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

/** §10.2 "webhook for status updates" — one endpoint per driver, same idempotent `ShipmentsService.applyCourierResult` path the poll job uses. */
@ApiTags("webhooks")
@Controller("webhooks/couriers")
export class ShipmentsWebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shipments: ShipmentsService,
  ) {}

  @Post(":driver")
  async handle(@Param("driver") driver: string, @Body() body: Record<string, unknown>) {
    const statusMap = STATUS_MAPS[driver];
    if (!statusMap) throw new NotFoundException(`Unknown courier driver "${driver}"`);

    const consignmentId = extractConsignmentId(driver, body);
    const rawStatus = extractRawStatus(body);
    if (!consignmentId || !rawStatus) return { ok: false, reason: "Could not identify consignment or status in webhook payload" };

    const shipment = await this.prisma.shipment.findFirst({ where: { consignmentId, courierDriver: driver } });
    if (!shipment) return { ok: false, reason: "No matching shipment" };

    await this.shipments.applyCourierResult(shipment.id, { status: statusMap[rawStatus] ?? "booked", rawStatus, raw: body });
    return { ok: true };
  }
}
