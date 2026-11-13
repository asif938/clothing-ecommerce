import { createHmac, randomBytes } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { GiftCard, GiftCardTransactionReason, Prisma } from "@clothing/db";
import { giftCardCodeFromBytes, giftCardUnusableReason, isGiftCardCodeShape, normalizeGiftCardCode, type GiftCardUnusableReason } from "@clothing/shared/rewards";
import type { Env } from "../config/env.schema";
import { PrismaService } from "../prisma/prisma.service";

export interface GiftCardEntry {
  reason: GiftCardTransactionReason;
  reference: string | null;
  orderId?: string | null;
  note?: string | null;
  createdBy?: string | null;
}

export type GiftCardLookup = { card: GiftCard; unusable: GiftCardUnusableReason | null } | null;

/**
 * Gift card codes and balance ledger (docs/PROJECT_SPEC.md §5.8 "code
 * (hashed + last4)"). Codes are HMAC-SHA256'd with the app key, so a
 * database leak alone doesn't reveal usable codes, and lookups stay exact.
 * Dependency-free (Prisma + config) for the same reason as the store credit
 * ledger: checkout, order lifecycle and the gift card module all use it.
 */
@Injectable()
export class GiftCardLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  hashCode(normalizedCode: string): string {
    return createHmac("sha256", `gift-card:${this.config.get("APP_ENCRYPTION_KEY", { infer: true })}`).update(normalizedCode).digest("hex");
  }

  /** A fresh code and its hash; retried by the caller on the (astronomically unlikely) hash collision. */
  newCode(): { code: string; codeHash: string; last4: string } {
    const code = giftCardCodeFromBytes(randomBytes(48));
    return { code, codeHash: this.hashCode(code), last4: code.slice(-4) };
  }

  /** Finds a card by what the shopper typed. Returns null for unknown codes (never says why, so codes can't be probed). */
  async findByCode(input: string, db: Prisma.TransactionClient | PrismaService = this.prisma, now = new Date()): Promise<GiftCardLookup> {
    const code = normalizeGiftCardCode(input);
    if (!isGiftCardCodeShape(code)) return null;
    const card = await db.giftCard.findUnique({ where: { codeHash: this.hashCode(code) } });
    if (!card) return null;
    return { card, unusable: giftCardUnusableReason(card, now) };
  }

  /** Spends from a card inside the caller's transaction; throws when it no longer covers the amount. */
  async debitInTx(tx: Prisma.TransactionClient, giftCardId: string, amount: number, entry: GiftCardEntry): Promise<void> {
    if (amount <= 0) return;
    const now = new Date();
    const updated = await tx.giftCard.updateMany({
      where: { id: giftCardId, status: "active", balance: { gte: amount }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      data: { balance: { decrement: amount } },
    });
    if (updated.count === 0) throw new BadRequestException({ code: "GIFT_CARD_INSUFFICIENT", message: "Your gift card balance has changed. Please review your order." });
    const after = await tx.giftCard.findUniqueOrThrow({ where: { id: giftCardId }, select: { balance: true } });
    if (after.balance === 0) await tx.giftCard.update({ where: { id: giftCardId }, data: { status: "redeemed" } });
    await tx.giftCardTransaction.create({
      data: { giftCardId, amount: -amount, reason: entry.reason, reference: entry.reference, orderId: entry.orderId ?? null, balanceAfter: after.balance, note: entry.note ?? null, createdBy: entry.createdBy ?? null },
    });
  }

  /** Puts value back on a card (order cancelled, staff adjustment); idempotent per (reason, reference). A fully-spent card becomes usable again. */
  async creditInTx(tx: Prisma.TransactionClient, giftCardId: string, amount: number, entry: GiftCardEntry): Promise<boolean> {
    if (amount <= 0) return false;
    if (entry.reference !== null) {
      const existing = await tx.giftCardTransaction.findUnique({ where: { reason_reference: { reason: entry.reason, reference: entry.reference } }, select: { id: true } });
      if (existing) return false;
    }
    const card = await tx.giftCard.update({ where: { id: giftCardId }, data: { balance: { increment: amount } }, select: { balance: true, status: true } });
    if (card.status === "redeemed") await tx.giftCard.update({ where: { id: giftCardId }, data: { status: "active" } });
    await tx.giftCardTransaction.create({
      data: { giftCardId, amount, reason: entry.reason, reference: entry.reference, orderId: entry.orderId ?? null, balanceAfter: card.balance, note: entry.note ?? null, createdBy: entry.createdBy ?? null },
    });
    return true;
  }
}
