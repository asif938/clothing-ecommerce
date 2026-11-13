import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LocationsService } from "../locations/locations.service";

export interface CartIdentity {
  customerId: string | null;
  anonymousId: string;
}

/** Cart CRUD (docs/PROJECT_SPEC.md §5.6, §7.5). The pricing pipeline (§6.3) lives in `CartPricingService` — this is just storage + identity resolution + merge-on-login. */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
  ) {}

  private includeItems() {
    return { items: { include: { variant: { include: { product: true } } } } } as const;
  }

  async getOrCreateActiveCart(identity: CartIdentity) {
    const existing = await this.prisma.cart.findFirst({
      where: identity.customerId ? { customerId: identity.customerId, status: "active" } : { anonymousId: identity.anonymousId, status: "active" },
      include: this.includeItems(),
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;

    return await this.prisma.cart.create({
      data: { customerId: identity.customerId, anonymousId: identity.customerId ? null : identity.anonymousId, status: "active" },
      include: this.includeItems(),
    });
  }

  private async assertAccess(cartId: string, identity: CartIdentity) {
    const cart = await this.prisma.cart.findUnique({ where: { id: cartId }, include: this.includeItems() });
    if (!cart) throw new NotFoundException("Cart not found");
    const owns = identity.customerId ? cart.customerId === identity.customerId : cart.anonymousId === identity.anonymousId;
    if (!owns) throw new ForbiddenException({ code: "FORBIDDEN", message: "Not your cart" });
    return cart;
  }

  async addItem(identity: CartIdentity, variantId: string, quantity: number) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
    if (!variant || !variant.isActive || variant.product.status !== "active") {
      throw new BadRequestException({ code: "VARIANT_UNAVAILABLE", message: "This item is no longer available" });
    }
    const cart = await this.getOrCreateActiveCart(identity);

    const existingItem = cart.items.find((item) => item.variantId === variantId);
    if (existingItem) {
      await this.prisma.cartItem.update({ where: { id: existingItem.id }, data: { quantity: existingItem.quantity + quantity, addedPrice: variant.price } });
    } else {
      await this.prisma.cartItem.create({ data: { cartId: cart.id, variantId, quantity, addedPrice: variant.price } });
    }
    await this.prisma.cart.update({ where: { id: cart.id }, data: { lastActivityAt: new Date() } });
    return await this.assertAccess(cart.id, identity);
  }

  /** §16 M10 "shop-the-look bundles" — the PDP's one-click "add the look" button; each component is added as its own ordinary cart line, so `CartPricingService`'s bundle match applies the same way whether a customer clicked this or added every piece by hand. */
  async addBundle(identity: CartIdentity, bundleProductId: string) {
    const items = await this.prisma.bundleItem.findMany({ where: { bundleProductId }, orderBy: { position: "asc" } });
    if (items.length === 0) throw new NotFoundException("This bundle has no items configured");
    for (const item of items) {
      await this.addItem(identity, item.componentVariantId, item.quantity);
    }
    return await this.getOrCreateActiveCart(identity);
  }

  async updateItemQuantity(identity: CartIdentity, cartItemId: string, quantity: number) {
    const cart = await this.getOrCreateActiveCart(identity);
    const item = cart.items.find((i) => i.id === cartItemId);
    if (!item) throw new NotFoundException("Cart item not found");
    if (quantity <= 0) {
      await this.prisma.cartItem.delete({ where: { id: cartItemId } });
    } else {
      await this.prisma.cartItem.update({ where: { id: cartItemId }, data: { quantity } });
    }
    await this.prisma.cart.update({ where: { id: cart.id }, data: { lastActivityAt: new Date() } });
    return await this.assertAccess(cart.id, identity);
  }

  async removeItem(identity: CartIdentity, cartItemId: string) {
    return await this.updateItemQuantity(identity, cartItemId, 0);
  }

  async setCodes(identity: CartIdentity, codes: string[]) {
    const cart = await this.getOrCreateActiveCart(identity);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCodes: codes } });
    return await this.assertAccess(cart.id, identity);
  }

  async setAddress(identity: CartIdentity, address: { divisionId: string; districtId: string; areaId: string; addressLine?: string; landmark?: string; contactName?: string; contactPhone?: string; contactEmail?: string }) {
    await this.locations.validateChain(address.divisionId, address.districtId, address.areaId);
    const cart = await this.getOrCreateActiveCart(identity);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { ...address, selectedShippingRateId: null } });
    return await this.assertAccess(cart.id, identity);
  }

  async selectShippingRate(identity: CartIdentity, rateId: string) {
    const cart = await this.getOrCreateActiveCart(identity);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { selectedShippingRateId: rateId } });
    return await this.assertAccess(cart.id, identity);
  }

  async setGiftWrap(identity: CartIdentity, giftWrap: boolean) {
    const cart = await this.getOrCreateActiveCart(identity);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { giftWrap } });
    return await this.assertAccess(cart.id, identity);
  }

  /** §16 M13 — how many loyalty points the customer wants to use; pricing decides how many apply. Guests can't redeem. */
  async setRedeemPoints(identity: CartIdentity, points: number) {
    if (!identity.customerId) throw new ForbiddenException({ code: "LOGIN_REQUIRED", message: "Log in to use your points." });
    const cart = await this.getOrCreateActiveCart(identity);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { redeemPoints: points } });
    return this.getOrCreateActiveCart(identity);
  }

  /** §16 M16 — a gift card the shopper applied (already validated by the controller) or null to remove it. */
  async setGiftCard(identity: CartIdentity, giftCardId: string | null) {
    const cart = await this.getOrCreateActiveCart(identity);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { giftCardId } });
    return await this.assertAccess(cart.id, identity);
  }

  /** §16 M16 — pay with the wallet; only a logged-in customer has one. */
  async setUseStoreCredit(identity: CartIdentity, use: boolean) {
    if (!identity.customerId) throw new ForbiddenException({ code: "LOGIN_REQUIRED", message: "Log in to use your store credit." });
    const cart = await this.getOrCreateActiveCart(identity);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { useStoreCredit: use } });
    return await this.assertAccess(cart.id, identity);
  }

  /** §16 M16 — the friend's referral code from a `?ref=` link or typed at checkout; pricing decides whether it applies. */
  async setReferralCode(identity: CartIdentity, code: string | null) {
    const cart = await this.getOrCreateActiveCart(identity);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { referralCode: code } });
    return await this.assertAccess(cart.id, identity);
  }

  /** §16 M16 — last affiliate link clicked (last click wins) and when, for the attribution window. */
  async setAffiliate(identity: CartIdentity, code: string) {
    const cart = await this.getOrCreateActiveCart(identity);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { affiliateCode: code, affiliateClickedAt: new Date() } });
  }

  async setCustomerNote(identity: CartIdentity, note: string | null) {
    const cart = await this.getOrCreateActiveCart(identity);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { customerNote: note } });
    return await this.assertAccess(cart.id, identity);
  }

  /** §6.13 "Cart merge on login: combine items, keep the larger quantity per variant, re-validate." */
  async mergeAnonymousIntoCustomer(anonymousId: string, customerId: string): Promise<void> {
    const guestCart = await this.prisma.cart.findFirst({ where: { anonymousId, status: "active" }, include: { items: true } });
    if (!guestCart || guestCart.items.length === 0) return;

    const customerCart = await this.getOrCreateActiveCart({ customerId, anonymousId });
    for (const guestItem of guestCart.items) {
      const existing = customerCart.items.find((i) => i.variantId === guestItem.variantId);
      if (existing) {
        if (guestItem.quantity > existing.quantity) {
          await this.prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: guestItem.quantity } });
        }
      } else {
        await this.prisma.cartItem.create({ data: { cartId: customerCart.id, variantId: guestItem.variantId, quantity: guestItem.quantity, addedPrice: guestItem.addedPrice } });
      }
    }
    // §16 M16 — keep what the shopper chose as a guest (gift card, referral and affiliate attribution) unless the account cart already has its own.
    await this.prisma.cart.update({
      where: { id: customerCart.id },
      data: {
        giftCardId: customerCart.giftCardId ?? guestCart.giftCardId,
        referralCode: customerCart.referralCode ?? guestCart.referralCode,
        ...(guestCart.affiliateCode && (!customerCart.affiliateClickedAt || (guestCart.affiliateClickedAt && guestCart.affiliateClickedAt > customerCart.affiliateClickedAt))
          ? { affiliateCode: guestCart.affiliateCode, affiliateClickedAt: guestCart.affiliateClickedAt }
          : {}),
      },
    });
    await this.prisma.cart.update({ where: { id: guestCart.id }, data: { status: "converted" } });
  }

  async markConverted(cartId: string): Promise<void> {
    // §16 M10 — `recoveredAt` is reporting only (did an abandoned cart ever
    // convert); `status` still becomes `converted` regardless of whether it
    // was ever marked `abandoned` first.
    await this.prisma.cart.update({ where: { id: cartId }, data: { status: "converted", recoveredAt: new Date() } });
  }
}
