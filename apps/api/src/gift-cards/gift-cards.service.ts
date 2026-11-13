import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type GiftCard } from "@clothing/db";
import { formatTakaFromPoisha } from "@clothing/shared/notifications";
import { formatGiftCardCode } from "@clothing/shared/rewards";
import { addMonths } from "@clothing/shared/marketing";
import type { Env } from "../config/env.schema";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { GiftCardLedgerService } from "../rewards-core/gift-card-ledger.service";
import { StoreCreditLedgerService } from "../rewards-core/store-credit-ledger.service";
import { isUniqueViolation } from "../common/document-number";
import type { AuthenticatedStaff } from "../common/types";
import type { AdjustGiftCardDto, IssueGiftCardDto, ListGiftCardsDto, ReissueGiftCardDto, SetGiftCardStatusDto } from "./dto";

const PAGE_SIZE = 50;
const SWEEP_BATCH = 200;

/** Fields safe to show staff and shoppers — never the hash. */
const PUBLIC_SELECT = {
  id: true,
  last4: true,
  initialAmount: true,
  balance: true,
  currency: true,
  status: true,
  source: true,
  expiresAt: true,
  purchaserCustomerId: true,
  purchaserName: true,
  purchaserPhone: true,
  purchaserEmail: true,
  recipientName: true,
  recipientPhone: true,
  recipientEmail: true,
  message: true,
  locale: true,
  deliveredAt: true,
  paymentMethod: true,
  paidAt: true,
  note: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GiftCardSelect;

/**
 * Gift cards (docs/PROJECT_SPEC.md §5.8, §16 M16 "buy, send, redeem"):
 * issuing (by staff or after a storefront purchase is paid), delivery of the
 * code, balance adjustments, disabling, re-issuing a lost code, moving a
 * balance into a customer's wallet, and the expiry sweep. Spending at
 * checkout goes through `GiftCardLedgerService`.
 */
@Injectable()
export class GiftCardsService {
  private readonly logger = new Logger(GiftCardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly ledger: GiftCardLedgerService,
    private readonly storeCredit: StoreCreditLedgerService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  async defaultExpiry(from = new Date()): Promise<Date | null> {
    const months = await this.settings.getValue<number>("giftCards.expiryMonths");
    return months > 0 ? addMonths(from, months) : null;
  }

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  async list(query: ListGiftCardsDto) {
    const q = query.q?.trim();
    const where: Prisma.GiftCardWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { last4: q.toUpperCase().slice(-4) },
              { purchaserPhone: { contains: q.replace(/\D/g, "") || q } },
              { recipientPhone: { contains: q.replace(/\D/g, "") || q } },
              { recipientName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.giftCard.findMany({ where, select: PUBLIC_SELECT, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.giftCard.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: PAGE_SIZE };
  }

  async get(id: string) {
    const card = await this.prisma.giftCard.findUnique({ where: { id }, select: { ...PUBLIC_SELECT, transactions: { orderBy: { createdAt: "desc" }, take: 200 } } });
    if (!card) throw new NotFoundException({ code: "GIFT_CARD_NOT_FOUND", message: "Gift card not found" });
    return card;
  }

  async stats() {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [outstanding, active, sold, redeemed] = await Promise.all([
      this.prisma.giftCard.aggregate({ where: { status: "active" }, _sum: { balance: true } }),
      this.prisma.giftCard.count({ where: { status: "active" } }),
      this.prisma.giftCard.aggregate({ where: { source: "purchase", paidAt: { gte: since } }, _sum: { initialAmount: true }, _count: true }),
      this.prisma.giftCardTransaction.aggregate({ where: { reason: "redeem", createdAt: { gte: since } }, _sum: { amount: true } }),
    ]);
    return {
      enabled: await this.settings.getValue<boolean>("giftCards.enabled"),
      outstandingBalance: outstanding._sum.balance ?? 0,
      activeCards: active,
      soldLast30Days: sold._sum.initialAmount ?? 0,
      soldCountLast30Days: sold._count,
      redeemedLast30Days: Math.abs(redeemed._sum.amount ?? 0),
    };
  }

  /** Issues a card from the admin panel. The plaintext code is returned once, for staff to hand over, and is not stored. */
  async issue(dto: IssueGiftCardDto, actor: AuthenticatedStaff): Promise<{ card: Awaited<ReturnType<GiftCardsService["get"]>>; code: string }> {
    const expiresAt = dto.expiresAt === undefined ? await this.defaultExpiry() : dto.expiresAt === null ? null : new Date(`${dto.expiresAt}T23:59:59.999+06:00`);
    if (expiresAt && expiresAt.getTime() <= Date.now()) throw new BadRequestException({ code: "EXPIRY_IN_PAST", message: "The expiry date must be in the future." });

    const { id, code } = await this.withFreshCode(async (fresh) => {
      return this.prisma.$transaction(async (tx) => {
        const card = await tx.giftCard.create({
          data: {
            codeHash: fresh.codeHash,
            last4: fresh.last4,
            initialAmount: dto.amount,
            balance: dto.amount,
            status: "active",
            source: "admin",
            expiresAt,
            recipientName: dto.recipientName ?? null,
            recipientPhone: dto.recipientPhone ?? null,
            recipientEmail: dto.recipientEmail ?? null,
            message: dto.message ?? null,
            locale: dto.locale,
            note: dto.note ?? null,
            createdBy: actor.id,
          },
        });
        await tx.giftCardTransaction.create({ data: { giftCardId: card.id, amount: dto.amount, reason: "issue", reference: card.id, balanceAfter: dto.amount, createdBy: actor.id, note: dto.note ?? null } });
        if (dto.send) await this.enqueueDelivery(tx, card, fresh.code);
        return { id: card.id, code: fresh.code };
      });
    });

    const card = await this.get(id);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "gift_card.issue", entityType: "gift_card", entityId: id, after: { ...card, transactions: undefined } });
    return { card, code: formatGiftCardCode(code) };
  }

  async setStatus(id: string, dto: SetGiftCardStatusDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    if (!["active", "disabled"].includes(before.status)) throw new BadRequestException({ code: "INVALID_STATE", message: "Only active or disabled cards can be switched." });
    if (dto.status === "active" && before.balance <= 0) throw new BadRequestException({ code: "NO_BALANCE", message: "This card has no balance left." });
    await this.prisma.giftCard.update({ where: { id }, data: { status: dto.status } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: `gift_card.${dto.status === "active" ? "enable" : "disable"}`, entityType: "gift_card", entityId: id, before: { status: before.status }, after: { status: dto.status, note: dto.note ?? null } });
    return this.get(id);
  }

  async adjust(id: string, dto: AdjustGiftCardDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    if (before.status === "pending" || before.status === "cancelled") throw new BadRequestException({ code: "INVALID_STATE", message: "This card was never paid for." });
    await this.prisma.$transaction(async (tx) => {
      const entry = { reason: "adjust" as const, reference: null, note: dto.note, createdBy: actor.id };
      if (dto.amount > 0) {
        await this.ledger.creditInTx(tx, id, dto.amount, entry);
        if (before.status === "expired") await tx.giftCard.update({ where: { id }, data: { status: "active", expiresAt: await this.defaultExpiry() } });
      } else {
        const updated = await tx.giftCard.updateMany({ where: { id, balance: { gte: -dto.amount } }, data: { balance: { decrement: -dto.amount } } });
        if (updated.count === 0) throw new BadRequestException({ code: "GIFT_CARD_INSUFFICIENT", message: "The card doesn't hold that much." });
        const after = await tx.giftCard.findUniqueOrThrow({ where: { id }, select: { balance: true } });
        if (after.balance === 0 && before.status === "active") await tx.giftCard.update({ where: { id }, data: { status: "redeemed" } });
        await tx.giftCardTransaction.create({ data: { giftCardId: id, amount: dto.amount, reason: "adjust", balanceAfter: after.balance, note: dto.note, createdBy: actor.id } });
      }
    });
    const after = await this.get(id);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "gift_card.adjust", entityType: "gift_card", entityId: id, before: { balance: before.balance }, after: { balance: after.balance, amount: dto.amount, note: dto.note } });
    return after;
  }

  /** A lost or leaked code: replaces it with a new one (the old code stops working) and optionally sends it again. */
  async reissue(id: string, dto: ReissueGiftCardDto, actor: AuthenticatedStaff): Promise<{ card: Awaited<ReturnType<GiftCardsService["get"]>>; code: string }> {
    const before = await this.get(id);
    if (before.status !== "active" && before.status !== "disabled") throw new BadRequestException({ code: "INVALID_STATE", message: "Only active or disabled cards can get a new code." });
    const { code } = await this.withFreshCode(async (fresh) =>
      this.prisma.$transaction(async (tx) => {
        const card = await tx.giftCard.update({
          where: { id },
          data: {
            codeHash: fresh.codeHash,
            last4: fresh.last4,
            ...(dto.recipientPhone ? { recipientPhone: dto.recipientPhone } : {}),
            ...(dto.recipientEmail ? { recipientEmail: dto.recipientEmail } : {}),
          },
        });
        if (card.recipientPhone || card.recipientEmail) await this.enqueueDelivery(tx, card, fresh.code);
        return { code: fresh.code };
      }),
    );
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "gift_card.reissue", entityType: "gift_card", entityId: id, before: { last4: before.last4 }, after: { last4: code.slice(-4) } });
    return { card: await this.get(id), code: formatGiftCardCode(code) };
  }

  // ---------------------------------------------------------------------------
  // Shared with purchases and the storefront
  // ---------------------------------------------------------------------------

  /** Runs `create` with a new code, retrying on the (practically impossible) hash collision. */
  async withFreshCode<T>(create: (fresh: { code: string; codeHash: string; last4: string }) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await create(this.ledger.newCode());
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === 2) throw error;
      }
    }
    throw new Error("unreachable");
  }

  /** Queues the message that carries the code to the recipient (and, for purchases, a receipt to the buyer). */
  async enqueueDelivery(tx: Prisma.TransactionClient, card: GiftCard, code: string): Promise<void> {
    const common = await this.notifications.commonVariables();
    const locale = card.locale === "en" ? "en" : "bn";
    const expires = card.expiresAt ? card.expiresAt.toISOString().slice(0, 10) : locale === "en" ? "no expiry" : "মেয়াদ নেই";
    if (card.recipientPhone || card.recipientEmail) {
      await this.notifications.enqueue(tx, {
        event: "gift_card_received",
        recipientType: "guest",
        locale,
        contacts: { sms: card.recipientPhone, whatsapp: card.recipientPhone, email: card.recipientEmail },
        variables: {
          ...common,
          recipient_name: card.recipientName ?? "",
          sender_name: card.purchaserName ?? common.brand_name ?? "",
          gift_card_code: formatGiftCardCode(code),
          gift_card_amount: formatTakaFromPoisha(card.balance),
          gift_card_expires: expires,
          gift_message: card.message ?? "",
          shop_url: this.config.get("STOREFRONT_URL", { infer: true }),
        },
        related: { type: "gift_card", id: card.id },
      });
      await tx.giftCard.update({ where: { id: card.id }, data: { deliveredAt: new Date() } });
    }
    if (card.source === "purchase" && (card.purchaserPhone || card.purchaserEmail)) {
      await this.notifications.enqueue(tx, {
        event: "gift_card_purchased",
        recipientType: card.purchaserCustomerId ? "customer" : "guest",
        recipientId: card.purchaserCustomerId,
        locale,
        contacts: { sms: card.purchaserPhone, whatsapp: card.purchaserPhone, email: card.purchaserEmail, push: card.purchaserCustomerId },
        variables: { ...common, customer_name: card.purchaserName ?? "", recipient_name: card.recipientName ?? "", gift_card_amount: formatTakaFromPoisha(card.initialAmount), gift_card_last4: code.slice(-4) },
        related: { type: "gift_card", id: card.id },
      });
    }
  }

  /** Storefront "check balance": only ever reveals balance/expiry for a code the shopper already holds. */
  async publicBalance(code: string) {
    const found = await this.ledger.findByCode(code);
    if (!found) throw new NotFoundException({ code: "GIFT_CARD_NOT_FOUND", message: "We couldn't find that gift card. Check the code and try again." });
    return { last4: found.card.last4, balance: found.card.balance, expiresAt: found.card.expiresAt, usable: found.unusable === null, reason: found.unusable };
  }

  /** "Add to wallet": moves a card's whole balance into the logged-in customer's store credit. */
  async transferToWallet(code: string, customerId: string) {
    const found = await this.ledger.findByCode(code);
    if (!found) throw new NotFoundException({ code: "GIFT_CARD_NOT_FOUND", message: "We couldn't find that gift card. Check the code and try again." });
    if (found.unusable) throw new BadRequestException({ code: `GIFT_CARD_${found.unusable}`, message: found.unusable === "EXPIRED" ? "This gift card has expired." : found.unusable === "NO_BALANCE" ? "This gift card has no balance left." : "This gift card can't be used." });
    const amount = found.card.balance;
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.debitInTx(tx, found.card.id, amount, { reason: "wallet_transfer", reference: `wallet:${found.card.id}:${Date.now()}`, note: `Moved to customer ${customerId}` });
      await this.storeCredit.creditInTx(tx, customerId, amount, { reason: "gift_card", reference: `gift_card:${found.card.id}:${Date.now()}`, note: `Gift card ••${found.card.last4}` });
    });
    await this.audit.record({ actorType: "customer", actorId: customerId, action: "gift_card.wallet_transfer", entityType: "gift_card", entityId: found.card.id, after: { amount } });
    return { amount };
  }

  // ---------------------------------------------------------------------------
  // Sweeps
  // ---------------------------------------------------------------------------

  /** Zeroes the balance of cards past their expiry date (the checkout check already refuses them; this keeps reports and statuses true). */
  async expirySweep(now = new Date()): Promise<{ expired: number }> {
    const due = await this.prisma.giftCard.findMany({ where: { status: { in: ["active", "disabled"] }, expiresAt: { lte: now } }, select: { id: true }, take: SWEEP_BATCH });
    let expired = 0;
    for (const { id } of due) {
      await this.prisma.$transaction(async (tx) => {
        const card = await tx.giftCard.findUniqueOrThrow({ where: { id }, select: { balance: true, status: true } });
        if (card.status === "expired") return;
        await tx.giftCard.update({ where: { id }, data: { status: "expired", balance: 0 } });
        if (card.balance > 0) await tx.giftCardTransaction.create({ data: { giftCardId: id, amount: -card.balance, reason: "expire", reference: `expire:${id}`, balanceAfter: 0 } });
      });
      expired += 1;
    }
    if (expired > 0) this.logger.log(`Expired ${expired} gift card(s)`);
    return { expired };
  }
}
