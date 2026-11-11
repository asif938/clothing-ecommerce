import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { formatTakaFromPoisha } from "@clothing/shared/notifications";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OrdersLifecycleService } from "../checkout/orders-lifecycle.service";
import type { Env } from "../config/env.schema";

export type ConfirmationState = "open" | "confirmed" | "cancelled" | "expired" | "closed";

const CONFIRMED_OR_BEYOND = new Set(["confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered", "partially_delivered", "completed"]);

/**
 * Customer self-confirmation (docs/PROJECT_SPEC.md §6.8 "customer self-confirm
 * link/WhatsApp button", §16 M11). A pending order gets an unguessable token
 * and a message (WhatsApp first, SMS fallback per the channel matrix) with a
 * link to the storefront confirm page. The token is the whole credential: it
 * is 192 bits, scoped to one order, and only ever moves a `pending` order to
 * `confirmed` (or `cancelled`, if the setting allows) - nothing else.
 */
@Injectable()
export class OrderConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly lifecycle: OrdersLifecycleService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Creates (or reuses) the token and queues the request message. Returns false when the order isn't eligible. */
  async request(orderId: string): Promise<boolean> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
    if (!order || order.status !== "pending") return false;

    const token = order.confirmationToken ?? randomBytes(24).toString("base64url");
    await this.prisma.order.update({ where: { id: orderId }, data: { confirmationToken: token, confirmationRequestedAt: new Date() } });

    const billing = (order.billingContact as { name?: string; phone?: string; email?: string } | null) ?? null;
    const phone = order.customer?.phone ?? billing?.phone ?? null;
    const storefrontUrl = this.config.get("STOREFRONT_URL", { infer: true }).replace(/\/$/, "");
    await this.notifications.enqueue(this.prisma, {
      event: "order_confirmation_request",
      recipientType: order.customerId ? "customer" : "guest",
      recipientId: order.customerId,
      locale: order.customer?.locale ?? "bn",
      contacts: { sms: phone, whatsapp: phone, email: order.customer?.email ?? billing?.email ?? null },
      variables: {
        ...(await this.notifications.commonVariables()),
        customer_name: order.customer?.name ?? billing?.name ?? "",
        order_number: order.orderNumber,
        order_total: formatTakaFromPoisha(order.total),
        confirm_link: `${storefrontUrl}/confirm-order/${token}`,
      },
      related: { type: "order", id: order.id },
    });
    await this.prisma.orderEvent.create({ data: { orderId, type: "notification_sent", data: { event: "order_confirmation_request" }, actor: { type: "system" } } });
    return true;
  }

  private async load(token: string) {
    const order = await this.prisma.order.findUnique({ where: { confirmationToken: token }, include: { items: { select: { title: true, quantity: true, lineTotal: true } } } });
    if (!order) throw new NotFoundException({ code: "CONFIRMATION_LINK_INVALID", message: "This confirmation link isn't valid." });
    return order;
  }

  async describe(token: string) {
    const order = await this.load(token);
    const [expiryHours, allowCancel] = await Promise.all([
      this.settings.getValue<number>("orders.selfConfirm.expiryHours"),
      this.settings.getValue<boolean>("orders.selfConfirm.allowCancel"),
    ]);
    const state = this.stateOf(order.status, order.confirmationRequestedAt, expiryHours);
    return {
      orderNumber: order.orderNumber,
      state,
      total: order.total,
      codAmount: order.codAmount,
      items: order.items.map((i) => ({ title: i.title, quantity: i.quantity, lineTotal: i.lineTotal })),
      canCancel: state === "open" && allowCancel,
    };
  }

  stateOf(status: string, requestedAt: Date | null, expiryHours: number, now = new Date()): ConfirmationState {
    if (CONFIRMED_OR_BEYOND.has(status)) return "confirmed";
    if (status === "cancelled") return "cancelled";
    if (status !== "pending") return "closed";
    if (requestedAt && now.getTime() - requestedAt.getTime() > expiryHours * 3_600_000) return "expired";
    return "open";
  }

  async respond(token: string, action: "confirm" | "cancel") {
    const order = await this.load(token);
    const [expiryHours, allowCancel] = await Promise.all([
      this.settings.getValue<number>("orders.selfConfirm.expiryHours"),
      this.settings.getValue<boolean>("orders.selfConfirm.allowCancel"),
    ]);
    const state = this.stateOf(order.status, order.confirmationRequestedAt, expiryHours);
    // Idempotent: tapping the link twice (or a WhatsApp button retry) is not an error.
    if (state === "confirmed" && action === "confirm") return { state };
    if (state !== "open") throw new BadRequestException({ code: "CONFIRMATION_NOT_OPEN", message: "This order can no longer be changed from this link.", state });
    if (action === "cancel" && !allowCancel) throw new BadRequestException({ code: "CANCEL_NOT_ALLOWED", message: "Please contact us to cancel this order." });

    const actor = order.customerId ? ({ type: "customer", id: order.customerId } as const) : ({ type: "system" } as const);
    await this.lifecycle.transition({ orderId: order.id, to: action === "confirm" ? "confirmed" : "cancelled", actor, reason: action === "cancel" ? "Cancelled by the customer from the confirmation link" : undefined });
    await this.prisma.orderEvent.create({ data: { orderId: order.id, type: "note", data: { note: action === "confirm" ? "Customer confirmed via link" : "Customer cancelled via link" }, actor: { type: "customer" } } });
    return { state: action === "confirm" ? ("confirmed" as const) : ("cancelled" as const) };
  }
}
