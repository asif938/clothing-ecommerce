import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Customer records (docs/PROJECT_SPEC.md §5.5). This milestone only needs
 * enough to back auth, carts and orders — the full admin customer list/
 * profile/tags/segments screen is M8's job (§16 M8).
 */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.customer.findUnique({ where: { id, deletedAt: null } });
  }

  findByPhone(phone: string) {
    return this.prisma.customer.findFirst({ where: { phone, deletedAt: null } });
  }

  findByGoogleId(googleId: string) {
    return this.prisma.customer.findFirst({ where: { googleId, deletedAt: null } });
  }

  async findOrCreateByPhone(phone: string): Promise<{ id: string; phone: string | null }> {
    const existing = await this.findByPhone(phone);
    if (existing) return existing;
    return await this.prisma.customer.create({ data: { phone, referralCode: await this.generateReferralCode() } });
  }

  /** §6.13: Google sign-in creates a customer if the email matches none; phone is asked for separately (optional, setting), never required at this step. */
  async findOrCreateByGoogle(googleId: string, email: string, name: string | null): Promise<{ id: string; phone: string | null }> {
    const existing = await this.findByGoogleId(googleId);
    if (existing) return existing;

    const byEmail = await this.prisma.customer.findFirst({ where: { email, deletedAt: null, googleId: null } });
    if (byEmail) {
      return await this.prisma.customer.update({ where: { id: byEmail.id }, data: { googleId } });
    }

    return await this.prisma.customer.create({ data: { googleId, email, name, referralCode: await this.generateReferralCode() } });
  }

  /**
   * §6.13: "If a phone is later verified that belongs to an existing
   * customer, merge accounts (orders, addresses, wishlist, points) after
   * OTP verification." Wishlist/points live client-side (localStorage) or
   * aren't built yet this milestone (loyalty is M13) — this merges what
   * exists now: orders, addresses, and the Google-only profile's identity
   * collapses into the phone-verified one.
   */
  async mergeGoogleOnlyIntoPhoneCustomer(googleOnlyCustomerId: string, phoneCustomerId: string): Promise<void> {
    if (googleOnlyCustomerId === phoneCustomerId) return;
    await this.prisma.$transaction([
      this.prisma.address.updateMany({ where: { customerId: googleOnlyCustomerId }, data: { customerId: phoneCustomerId } }),
      this.prisma.order.updateMany({ where: { customerId: googleOnlyCustomerId }, data: { customerId: phoneCustomerId } }),
      this.prisma.cart.updateMany({ where: { customerId: googleOnlyCustomerId }, data: { customerId: phoneCustomerId } }),
      this.prisma.customer.update({ where: { id: googleOnlyCustomerId }, data: { deletedAt: new Date() } }),
    ]);
  }

  async attachPhone(customerId: string, phone: string): Promise<void> {
    await this.prisma.customer.update({ where: { id: customerId }, data: { phone } });
  }

  async recordLastSeen(customerId: string): Promise<void> {
    await this.prisma.customer.update({ where: { id: customerId }, data: { lastSeenAt: new Date() } });
  }

  updateProfile(customerId: string, data: { name?: string; email?: string | null; gender?: string | null; birthday?: Date | null; locale?: string }) {
    return this.prisma.customer.update({ where: { id: customerId }, data });
  }

  private async generateReferralCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomBytes(4).toString("hex").toUpperCase();
      const exists = await this.prisma.customer.findUnique({ where: { referralCode: code } });
      if (!exists) return code;
    }
    return randomBytes(6).toString("hex").toUpperCase();
  }
}
