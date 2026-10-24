import { Injectable } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { BlocklistService } from "../blocklist/blocklist.service";
import { FraudCheckProvidersService } from "./fraud-check-providers.service";
import { addressLooksInvalid, computeRiskScore, nameLooksInvalid, riskLevelFor, type RiskWeights } from "./risk-score";

export interface ScoreOrderInput {
  customerId: string | null;
  phone: string;
  ip: string | null;
  deviceId: string | null;
  orderTotal: number;
  recipientName: string;
  addressLine: string;
  otpVerified: boolean;
}

export interface ScoreOrderResult {
  score: number;
  level: "low" | "medium" | "high";
  reasonCodes: string[];
}

const BURST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Risk scoring orchestration (docs/PROJECT_SPEC.md §6.6) — gathers the signals computeRiskScore needs from the database and settings, then scores. */
@Injectable()
export class RiskScoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly blocklist: BlocklistService,
    private readonly fraudCheck: FraudCheckProvidersService,
  ) {}

  async score(input: ScoreOrderInput): Promise<ScoreOrderResult> {
    const [weights, thresholds, highValueThreshold, phoneBlocked, fraudCheckDriver] = await Promise.all([
      this.settings.getValue<RiskWeights>("risk.weights"),
      this.settings.getValue<{ low: number; medium: number }>("risk.thresholds"),
      this.settings.getValue<number>("risk.highValueThreshold"),
      this.blocklist.findMatch({ phone: input.phone, ip: input.ip, device: input.deviceId }),
      this.fraudCheck.resolveActiveDriver(),
    ]);

    const courierHistory = await fraudCheckDriver.checkPhone(input.phone);

    const since = new Date(Date.now() - BURST_WINDOW_MS);
    const phoneOrDeviceMatch: Prisma.OrderWhereInput[] = [{ billingContact: { path: ["phone"], equals: input.phone } }];
    if (input.deviceId) phoneOrDeviceMatch.push({ deviceId: input.deviceId });

    const [customer, recentByPhoneOrDevice, recentByIpRows] = await Promise.all([
      input.customerId ? this.prisma.customer.findUnique({ where: { id: input.customerId } }) : null,
      this.prisma.order.count({ where: { createdAt: { gte: since }, OR: phoneOrDeviceMatch } }),
      input.ip ? this.prisma.order.findMany({ where: { ip: input.ip, createdAt: { gte: since } }, select: { billingContact: true } }) : Promise.resolve([]),
    ]);
    const recentByIp = new Set(recentByIpRows.map((r) => (r.billingContact as { phone?: string } | null)?.phone).filter(Boolean)).size;

    const [previousDoorstepRejections, previousCancelledAfterConfirm] = input.customerId
      ? await Promise.all([
          this.prisma.order.count({ where: { customerId: input.customerId, status: "rejected_at_door" } }),
          this.prisma.order.count({ where: { customerId: input.customerId, status: "cancelled", confirmedAt: { not: null } } }),
        ])
      : [0, 0];

    const { score, reasonCodes } = computeRiskScore(
      {
        phoneBlocked,
        courierSuccessRatio: courierHistory.deliverySuccessRatio,
        courierSampleSize: courierHistory.sampleSize,
        previousDoorstepRejections,
        previousCancelledAfterConfirm,
        isNewCustomer: !customer || customer.ordersCount === 0,
        orderTotal: input.orderTotal,
        highValueThreshold,
        samePhoneOrDeviceOrdersLast24h: recentByPhoneOrDevice,
        sameIpDifferentPhonesLast24h: recentByIp,
        addressLooksInvalid: addressLooksInvalid(input.addressLine),
        nameLooksInvalid: nameLooksInvalid(input.recipientName),
        deliveredCount: customer?.deliveredCount ?? 0,
        rejectedAtDoorCount: customer?.rejectedAtDoorCount ?? 0,
        otpVerified: input.otpVerified,
      },
      weights,
    );

    return { score, level: riskLevelFor(score, thresholds), reasonCodes };
  }

  /** §6.6: "same phone + same items within risk.duplicateWindowMinutes -> flag as possible duplicate." Returns other order ids that look like duplicates, for the caller to link/flag — never blocks on its own. */
  async findPossibleDuplicates(phone: string, variantIds: string[]): Promise<string[]> {
    const windowMinutes = await this.settings.getValue<number>("risk.duplicateWindowMinutes");
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const candidates = await this.prisma.order.findMany({
      where: { createdAt: { gte: since }, billingContact: { path: ["phone"], equals: phone } },
      include: { items: { select: { variantId: true } } },
    });
    const variantSet = new Set(variantIds);
    return candidates.filter((order) => order.items.some((item) => variantSet.has(item.variantId))).map((order) => order.id);
  }
}
