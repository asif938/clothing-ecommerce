import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type PaymentMethod, type PaymentPurpose } from "@clothing/db";
import type { Env } from "../config/env.schema";
import {
  createBkashDriver,
  createMockPaymentDriver,
  createNagadDriver,
  createSslcommerzDriver,
  mockPaymentConfigSchema,
  bkashConfigSchema,
  nagadConfigSchema,
  sslcommerzConfigSchema,
  type PaymentDriver,
} from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { ProviderRegistryService } from "../providers/provider-registry.service";
import { OrdersLifecycleService } from "../checkout/orders-lifecycle.service";

const ONLINE_METHODS = ["mock", "sslcommerz", "bkash", "nagad"] as const;
export type OnlinePaymentMethod = (typeof ONLINE_METHODS)[number];

export function isOnlinePaymentMethod(value: string): value is OnlinePaymentMethod {
  return (ONLINE_METHODS as readonly string[]).includes(value);
}

/**
 * §16 M16 — a payment that belongs to something other than an order (a gift
 * card purchase). Its owner keeps the gateway reference itself and is asked
 * to settle it when a callback arrives for a reference no `payments` row
 * knows. Returns true when it recognised the reference.
 */
export type StandalonePaymentHandler = (method: OnlinePaymentMethod, externalRef: string, callbackPayload?: Record<string, unknown>) => Promise<boolean>;

/** Payment drivers behind one interface (docs/PROJECT_SPEC.md §10.1) — COD is handled directly by checkout (no driver); this resolves and drives the online methods. */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly standaloneHandlers: StandalonePaymentHandler[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly registry: ProviderRegistryService,
    private readonly lifecycle: OrdersLifecycleService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  async availableMethods(): Promise<string[]> {
    const codEnabled = await this.settings.getValue<boolean>("payment.codEnabled");
    const instances = await this.prisma.providerInstance.findMany({ where: { capability: "payment", enabled: true } });
    const online = instances.map((i) => i.driver).filter((driver): driver is OnlinePaymentMethod => (ONLINE_METHODS as readonly string[]).includes(driver));
    return [...(codEnabled ? ["cod"] : []), ...online];
  }

  private async resolveDriver(method: OnlinePaymentMethod, instanceId?: string): Promise<{ driver: PaymentDriver; providerInstanceId: string | null }> {
    const instance = instanceId
      ? await this.prisma.providerInstance.findUnique({ where: { id: instanceId } })
      : await this.prisma.providerInstance.findFirst({ where: { capability: "payment", driver: method, enabled: true } });

    if (!instance) {
      if (method === "mock") return { driver: createMockPaymentDriver(mockPaymentConfigSchema.parse({})), providerInstanceId: null };
      throw new BadRequestException({ code: "PAYMENT_METHOD_NOT_CONFIGURED", message: `${method} is not currently available.` });
    }
    const config = this.registry.decryptConfig(instance.config);
    switch (instance.driver) {
      case "mock":
        return { driver: createMockPaymentDriver(mockPaymentConfigSchema.parse(config)), providerInstanceId: instance.id };
      case "sslcommerz":
        return { driver: createSslcommerzDriver(sslcommerzConfigSchema.parse(config)), providerInstanceId: instance.id };
      case "bkash":
        return { driver: createBkashDriver(bkashConfigSchema.parse(config)), providerInstanceId: instance.id };
      case "nagad":
        return { driver: createNagadDriver(nagadConfigSchema.parse(config)), providerInstanceId: instance.id };
      default:
        throw new BadRequestException({ code: "UNKNOWN_PAYMENT_DRIVER", message: `No payment driver "${instance.driver}"` });
    }
  }

  /** Creates the payment row and starts the provider's hosted-page flow; the caller redirects the customer to the returned URL. */
  async initiate(orderId: string, method: OnlinePaymentMethod, purpose: PaymentPurpose, amount: number, returnUrls: { success: string; fail: string; cancel: string }, customer: { name?: string; phone?: string; email?: string }, orderNumber: string) {
    const { driver, providerInstanceId } = await this.resolveDriver(method);
    const payment = await this.prisma.payment.create({
      data: { orderId, providerInstanceId, method: method as PaymentMethod, purpose, amount, status: "initiated" },
    });

    try {
      const result = await driver.initiate({ amount, currency: "BDT", orderNumber, customerName: customer.name, customerPhone: customer.phone, customerEmail: customer.email, returnUrls });
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: "pending", externalRef: result.externalRef, raw: toJsonInput(result.raw) } });
      // Drivers with no real hosted domain of their own (the mock) return a path on this API; a real gateway's URL is already absolute.
      const redirectUrl = result.redirectUrl.startsWith("/") ? `${this.config.get("API_URL", { infer: true })}${result.redirectUrl}` : result.redirectUrl;
      return { paymentId: payment.id, redirectUrl };
    } catch (error) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
      throw error;
    }
  }

  /** §16 M16 — lets another module (gift card purchases) settle its own standalone payments when their callbacks arrive. */
  registerStandaloneHandler(handler: StandalonePaymentHandler): void {
    this.standaloneHandlers.push(handler);
  }

  /** Starts a hosted-page payment that isn't for an order: no `payments` row, the caller stores the returned reference (§16 M16 gift card purchases). */
  async initiateStandalone(method: OnlinePaymentMethod, amount: number, reference: string, returnUrls: { success: string; fail: string; cancel: string }, customer: { name?: string; phone?: string; email?: string }) {
    const { driver, providerInstanceId } = await this.resolveDriver(method);
    const result = await driver.initiate({ amount, currency: "BDT", orderNumber: reference, customerName: customer.name, customerPhone: customer.phone, customerEmail: customer.email, returnUrls });
    const redirectUrl = result.redirectUrl.startsWith("/") ? `${this.config.get("API_URL", { infer: true })}${result.redirectUrl}` : result.redirectUrl;
    return { externalRef: result.externalRef, redirectUrl, providerInstanceId };
  }

  /** Asks the provider what happened to a standalone payment. */
  async verifyStandalone(method: OnlinePaymentMethod, providerInstanceId: string | null, externalRef: string, callbackPayload?: Record<string, unknown>) {
    const { driver } = await this.resolveDriver(method, providerInstanceId ?? undefined);
    return driver.verify(externalRef, callbackPayload);
  }

  /** Called from a provider's callback/IPN/redirect route, or the reconciliation job re-querying a `pending` payment — idempotent (§10.1). */
  async confirmByExternalRef(method: OnlinePaymentMethod, externalRef: string, callbackPayload?: Record<string, unknown>): Promise<void> {
    const payment = await this.prisma.payment.findFirst({ where: { externalRef, method: method as PaymentMethod } });
    if (!payment) {
      for (const handler of this.standaloneHandlers) {
        if (await handler(method, externalRef, callbackPayload)) return;
      }
      throw new NotFoundException("Payment not found");
    }
    if (payment.status === "succeeded" || payment.status === "failed" || payment.status === "cancelled") return; // already settled — idempotent no-op

    const { driver } = await this.resolveDriver(method, payment.providerInstanceId ?? undefined);
    const result = await driver.verify(externalRef, callbackPayload);

    if (result.status === "succeeded") {
      if (result.amount !== undefined && result.amount !== payment.amount) {
        this.logger.warn(`Payment ${payment.id} verified amount ${result.amount} differs from expected ${payment.amount}`);
      }
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: "succeeded", paidAt: new Date(), raw: toJsonInput(result.raw) } });
      await this.lifecycle.onPaymentSucceeded(payment.orderId, payment.purpose, payment.amount);
    } else if (result.status === "failed") {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: "failed", raw: toJsonInput(result.raw) } });
      await this.lifecycle.onPaymentFailed(payment.orderId);
    }
    // "pending" result: leave as-is, the reconciliation job will re-check later.
  }

  /** Reconciliation (§10.1): "reconcile pending payments older than 15 min by querying the provider." */
  async reconcilePending(olderThanMinutes = 15): Promise<{ checked: number }> {
    const threshold = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const stale = await this.prisma.payment.findMany({ where: { status: "pending", updatedAt: { lte: threshold } } });
    for (const payment of stale) {
      if (!payment.externalRef) continue;
      try {
        await this.confirmByExternalRef(payment.method as OnlinePaymentMethod, payment.externalRef);
      } catch (error) {
        this.logger.warn(`Reconciliation failed for payment ${payment.id}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
    return { checked: stale.length };
  }
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}
