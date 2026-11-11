import { Injectable, Logger } from "@nestjs/common";
import webpush from "web-push";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Web push (docs/PROJECT_SPEC.md §16 M10) — deliberately not a
 * `provider_instances` driver (golden rule 2 is about swappable *vendors*;
 * there's no alternative "push provider" to choose between, we're always
 * talking straight to the browser's own push service via our site's VAPID
 * identity — see docs/DECISIONS.md). Keys live in the settings registry
 * (`pwa.vapidPublicKey`/`vapidPrivateKey`) instead, generated once via
 * `POST /admin/push/generate-vapid-keys`.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async vapidKeys(): Promise<{ publicKey: string | null; privateKey: string | null }> {
    const [publicKey, privateKey] = await Promise.all([
      this.settings.getValue<string | null>("pwa.vapidPublicKey"),
      this.settings.getValue<string | null>("pwa.vapidPrivateKey"),
    ]);
    return { publicKey, privateKey };
  }

  generateKeypair() {
    return webpush.generateVAPIDKeys();
  }

  private async configureWebPush(): Promise<void> {
    const { publicKey, privateKey } = await this.vapidKeys();
    if (!publicKey || !privateKey) throw new Error("Web push isn't configured yet — generate a VAPID keypair first.");
    const contact = (await this.settings.getValue<string | null>("brand.phone")) ?? "support@example.com";
    webpush.setVapidDetails(contact.startsWith("mailto:") ? contact : `mailto:${contact.replace(/[^\d+]/g, "")}@invalid.example`, publicKey, privateKey);
  }

  async subscribe(input: { customerId: string | null; endpoint: string; p256dh: string; auth: string; userAgent: string | null; locale: string }) {
    return await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { customerId: input.customerId, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent, locale: input.locale },
      update: { customerId: input.customerId, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent, locale: input.locale },
    });
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  async countSubscriptions(): Promise<number> {
    return await this.prisma.pushSubscription.count();
  }

  /** Sends to every subscription a customer has (usually one, but multiple devices are possible). Throws when none exist, so the notification pipeline's retry/fallback treats it the same as any other unreachable channel. */
  async sendToCustomer(customerId: string, payload: PushPayload): Promise<void> {
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { customerId } });
    if (subscriptions.length === 0) throw new Error("NO_PUSH_SUBSCRIPTION");
    await this.configureWebPush();
    const sent = await this.deliver(subscriptions, payload);
    if (sent === 0) throw new Error("PUSH_SEND_FAILED");
  }

  /** M11 admin PWA - a staff member's devices. Best effort: returns how many devices were reached and never throws (a missed push must not fail the order/notification that triggered it). */
  async sendToStaff(staffUserId: string, payload: PushPayload): Promise<number> {
    try {
      if (!(await this.settings.getValue<boolean>("pwa.adminPushEnabled"))) return 0;
      const subscriptions = await this.prisma.pushSubscription.findMany({ where: { staffUserId } });
      if (subscriptions.length === 0) return 0;
      await this.configureWebPush();
      return await this.deliver(subscriptions, payload);
    } catch (error) {
      this.logger.warn(`Staff push failed for ${staffUserId}: ${error instanceof Error ? error.message : "Unknown error"}`);
      return 0;
    }
  }

  async subscribeStaff(input: { staffUserId: string; endpoint: string; p256dh: string; auth: string; userAgent: string | null; locale: string }) {
    return await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { staffUserId: input.staffUserId, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent, locale: input.locale },
      // A browser profile can switch from shopper to staff: the endpoint now belongs to the staff member only.
      update: { staffUserId: input.staffUserId, customerId: null, p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent, locale: input.locale },
    });
  }

  async unsubscribeStaff(staffUserId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, staffUserId } });
  }

  private async deliver(subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[], payload: PushPayload): Promise<number> {
    let sent = 0;
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload));
        await this.prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastSentAt: new Date() } });
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Expired/unknown subscription per the Web Push protocol - remove it rather than retrying forever.
          await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
          continue;
        }
        this.logger.warn(`Push send failed for subscription ${sub.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    return sent;
  }

  /** Used by `NotificationDriversService` for the generic `push` channel — `to` is a customerId (see `contactFor` there). */
  async sendRaw(customerId: string, subject: string | null, body: string): Promise<void> {
    await this.sendToCustomer(customerId, { title: subject ?? "Update", body });
  }
}
