import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CustomersService } from "../customers/customers.service";
import { CartService, type CartIdentity } from "./cart.service";
import { CartPricingService, type CartPricingContext } from "./cart-pricing.service";
import {
  addItemSchema,
  selectShippingRateSchema,
  setCartAddressSchema,
  setCodesSchema,
  setCustomerNoteSchema,
  setGiftWrapSchema,
  updateItemSchema,
  type AddItemDto,
  type SelectShippingRateDto,
  type SetCartAddressDto,
  type SetCodesDto,
  type SetCustomerNoteDto,
  type SetGiftWrapDto,
  type UpdateItemDto,
} from "./dto";

/** §7.5 cart drawer/page + §11.2 `cart` endpoint group. Every mutation returns the cart AND its freshly-recomputed pricing (golden rule 6 — the client never computes its own total). */
@ApiTags("store")
@Controller("store/cart")
@UseGuards(CustomerContextGuard)
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly pricing: CartPricingService,
    private readonly customers: CustomersService,
  ) {}

  private identity(req: Request): CartIdentity {
    return { customerId: req.customerContext!.customer?.id ?? null, anonymousId: req.customerContext!.anonymousId };
  }

  private async context(req: Request, paymentMethod?: string): Promise<CartPricingContext> {
    const customerId = req.customerContext!.customer?.id ?? null;
    const customer = customerId ? await this.customers.findById(customerId) : null;
    return {
      customerId,
      phone: customer?.phone ?? req.customerContext!.customer?.phone ?? null,
      isFirstOrder: !customer || customer.ordersCount === 0,
      channel: "web",
      paymentMethod: paymentMethod ?? null,
    };
  }

  private async respond(req: Request, cart: Awaited<ReturnType<CartService["getOrCreateActiveCart"]>>) {
    return { cart, pricing: await this.pricing.price(cart, await this.context(req)) };
  }

  @Get()
  async get(@Req() req: Request) {
    const cart = await this.cart.getOrCreateActiveCart(this.identity(req));
    return await this.respond(req, cart);
  }

  @Post("items")
  async addItem(@Body(new ZodValidationPipe(addItemSchema)) body: AddItemDto, @Req() req: Request) {
    const cart = await this.cart.addItem(this.identity(req), body.variantId, body.quantity);
    return await this.respond(req, cart);
  }

  /** §16 M10 — adds every one of a shop-the-look bundle's component variants in one call. */
  @Post("bundles/:bundleProductId")
  async addBundle(@Param("bundleProductId") bundleProductId: string, @Req() req: Request) {
    const cart = await this.cart.addBundle(this.identity(req), bundleProductId);
    return await this.respond(req, cart);
  }

  @Patch("items/:id")
  async updateItem(@Param("id") id: string, @Body(new ZodValidationPipe(updateItemSchema)) body: UpdateItemDto, @Req() req: Request) {
    const cart = await this.cart.updateItemQuantity(this.identity(req), id, body.quantity);
    return await this.respond(req, cart);
  }

  @Delete("items/:id")
  async removeItem(@Param("id") id: string, @Req() req: Request) {
    const cart = await this.cart.removeItem(this.identity(req), id);
    return await this.respond(req, cart);
  }

  @Put("codes")
  async setCodes(@Body(new ZodValidationPipe(setCodesSchema)) body: SetCodesDto, @Req() req: Request) {
    const cart = await this.cart.setCodes(this.identity(req), body.codes);
    return await this.respond(req, cart);
  }

  @Patch("address")
  async setAddress(@Body(new ZodValidationPipe(setCartAddressSchema)) body: SetCartAddressDto, @Req() req: Request) {
    const cart = await this.cart.setAddress(this.identity(req), body);
    return await this.respond(req, cart);
  }

  @Patch("shipping-rate")
  async selectShippingRate(@Body(new ZodValidationPipe(selectShippingRateSchema)) body: SelectShippingRateDto, @Req() req: Request) {
    const cart = await this.cart.selectShippingRate(this.identity(req), body.rateId);
    return await this.respond(req, cart);
  }

  @Patch("gift-wrap")
  async setGiftWrap(@Body(new ZodValidationPipe(setGiftWrapSchema)) body: SetGiftWrapDto, @Req() req: Request) {
    const cart = await this.cart.setGiftWrap(this.identity(req), body.giftWrap);
    return await this.respond(req, cart);
  }

  @Patch("note")
  async setNote(@Body(new ZodValidationPipe(setCustomerNoteSchema)) body: SetCustomerNoteDto, @Req() req: Request) {
    const cart = await this.cart.setCustomerNote(this.identity(req), body.note);
    return await this.respond(req, cart);
  }

  /** Lets the checkout page preview totals under a candidate payment method before placing the order (payment-rules conditions can key off it). */
  @Get("quote")
  async quote(@Query("paymentMethod") paymentMethod: string | undefined, @Req() req: Request) {
    const cart = await this.cart.getOrCreateActiveCart(this.identity(req));
    return { cart, pricing: await this.pricing.price(cart, await this.context(req, paymentMethod)) };
  }
}
