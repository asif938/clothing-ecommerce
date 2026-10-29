import { ConflictException, Injectable, InternalServerErrorException } from "@nestjs/common";
import type { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";

export interface ReservationLine {
  variantId: string;
  quantity: number;
}

/**
 * Stock reservation (docs/PROJECT_SPEC.md §6.7) — the one atomic operation
 * the whole milestone's race-condition acceptance scenario depends on:
 * "two buyers race for the last unit: exactly one order succeeds."
 *
 * `reserved += q` only commits when `available >= q` in the SAME
 * conditional UPDATE (Postgres evaluates the WHERE clause under the row's
 * own lock, so two concurrent updates against the same row never both see
 * enough stock) — not a read-then-write check, which would race. Every
 * line of an order reserves inside one transaction; throwing here rolls
 * back any lines already reserved earlier in the same order.
 *
 * Multi-location allocation (preferring whichever location can fulfill
 * the whole order) is phase 2 (§6.7) — M5 always reserves against the
 * single default location, see docs/DECISIONS.md.
 */
@Injectable()
export class StockReservationService {
  constructor(private readonly prisma: PrismaService) {}

  async defaultLocation() {
    const location = await this.prisma.stockLocation.findFirst({ where: { isDefault: true, isActive: true } });
    if (!location) throw new InternalServerErrorException("No default, active stock location is configured");
    return location;
  }

  async reserve(tx: Prisma.TransactionClient, locationId: string, lines: ReservationLine[]): Promise<void> {
    for (const line of lines) {
      if (line.quantity <= 0) continue;
      const updatedRows: number = await tx.$executeRaw`
        UPDATE inventory_levels
        SET reserved = reserved + ${line.quantity}
        WHERE variant_id = ${line.variantId} AND location_id = ${locationId} AND available >= ${line.quantity}
      `;
      if (updatedRows === 0) {
        throw new ConflictException({ code: "OUT_OF_STOCK", message: "One or more items in your order just went out of stock." });
      }
    }
  }

  /** Cancel before ship, or payment-timeout expiry (§6.7). Only un-reserves — nothing physically moved, so no `StockMovement` row. */
  async release(tx: Prisma.TransactionClient, locationId: string, lines: ReservationLine[]): Promise<void> {
    for (const line of lines) {
      if (line.quantity <= 0) continue;
      await tx.$executeRaw`
        UPDATE inventory_levels
        SET reserved = reserved - ${line.quantity}
        WHERE variant_id = ${line.variantId} AND location_id = ${locationId}
      `;
    }
  }

  /**
   * §6.8 "stock decrement (setting)" — the reservation already took the
   * stock out of `available` at order time; this is the moment it actually
   * leaves the building (packed or shipped, per `orders.stockDecrementAt`).
   * Reduces `on_hand` and `reserved` together so `available` doesn't move
   * again here, and logs a `StockMovement` (unlike `release`, which never
   * touches `on_hand` because nothing physically moved).
   */
  async fulfill(tx: Prisma.TransactionClient, locationId: string, lines: ReservationLine[], reference: { type: string; id: string }): Promise<void> {
    for (const line of lines) {
      if (line.quantity <= 0) continue;
      await tx.$executeRaw`
        UPDATE inventory_levels
        SET on_hand = on_hand - ${line.quantity}, reserved = reserved - ${line.quantity}
        WHERE variant_id = ${line.variantId} AND location_id = ${locationId}
      `;
      await tx.stockMovement.create({
        data: { variantId: line.variantId, locationId, quantity: -line.quantity, reason: "sale", referenceType: reference.type, referenceId: reference.id, actor: "system" },
      });
    }
  }

  /** §6.9 step 5 / §6.10 — QC-passed returned/rejected items go back on hand. Items that fail QC never call this (see `ReturnsService`/`ShipmentsService` — they write an event instead, no inventory movement). */
  async restock(tx: Prisma.TransactionClient, locationId: string, lines: ReservationLine[], reference: { type: string; id: string }): Promise<void> {
    for (const line of lines) {
      if (line.quantity <= 0) continue;
      await tx.$executeRaw`UPDATE inventory_levels SET on_hand = on_hand + ${line.quantity} WHERE variant_id = ${line.variantId} AND location_id = ${locationId}`;
      await tx.stockMovement.create({
        data: { variantId: line.variantId, locationId, quantity: line.quantity, reason: "return_restock", referenceType: reference.type, referenceId: reference.id, actor: "system" },
      });
    }
  }
}
