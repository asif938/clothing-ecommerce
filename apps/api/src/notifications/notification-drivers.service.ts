import { Injectable } from "@nestjs/common";
import {
  createMockSmsDriver,
  mockSmsConfigSchema,
  createGenericHttpSmsDriver,
  genericHttpSmsConfigSchema,
  createSslWirelessDriver,
  sslWirelessConfigSchema,
  createBulkSmsBdDriver,
  bulkSmsBdConfigSchema,
  createMockEmailDriver,
  mockEmailConfigSchema,
  createSmtpEmailDriver,
  smtpEmailConfigSchema,
  createBrevoEmailDriver,
  brevoEmailConfigSchema,
  createResendEmailDriver,
  resendEmailConfigSchema,
  createMockWhatsappDriver,
  mockWhatsappConfigSchema,
  createWhatsappCloudDriver,
  whatsappCloudConfigSchema,
  type EmailDriver,
  type SmsDriver,
  type WhatsappDriver,
} from "@clothing/shared/providers";
import type { NotificationChannel } from "@clothing/shared/notifications";
import { ProviderRegistryService } from "../providers/provider-registry.service";

export interface ResolvedDriver<T> {
  driver: T;
  driverName: string;
  instanceId: string | null;
}

/**
 * Resolves the active driver for each of the three notification channels
 * (docs/PROJECT_SPEC.md §10.3) — same "resolve from `provider_instances`,
 * fall back to the mock driver when nothing is configured" pattern M5's
 * `SmsProvidersService` already established, generalized to sms/email/
 * whatsapp and extended to the drivers added this milestone. Falling back
 * to mock rather than treating "nothing configured" as "channel
 * unavailable" keeps a fresh install's acceptance scenario working with no
 * admin setup (§16 M7: "sends the configured messages via mock drivers")
 * — real unavailability still surfaces through `NotificationDispatchService`
 * falling back to the next channel after this driver's `send()` actually
 * fails out its retries.
 */
@Injectable()
export class NotificationDriversService {
  constructor(private readonly registry: ProviderRegistryService) {}

  async resolveSms(): Promise<ResolvedDriver<SmsDriver>> {
    const active = await this.registry.findActiveInstance("sms");
    if (active) {
      switch (active.driver) {
        case "generic_http":
          return { driver: createGenericHttpSmsDriver(genericHttpSmsConfigSchema.parse(active.config)), driverName: active.driver, instanceId: active.instanceId };
        case "sslwireless":
          return { driver: createSslWirelessDriver(sslWirelessConfigSchema.parse(active.config)), driverName: active.driver, instanceId: active.instanceId };
        case "bulksmsbd":
          return { driver: createBulkSmsBdDriver(bulkSmsBdConfigSchema.parse(active.config)), driverName: active.driver, instanceId: active.instanceId };
        default:
          return { driver: createMockSmsDriver(mockSmsConfigSchema.parse(active.config)), driverName: "mock", instanceId: active.instanceId };
      }
    }
    return { driver: createMockSmsDriver(mockSmsConfigSchema.parse({})), driverName: "mock", instanceId: null };
  }

  async resolveEmail(): Promise<ResolvedDriver<EmailDriver>> {
    const active = await this.registry.findActiveInstance("email");
    if (active) {
      switch (active.driver) {
        case "smtp":
          return { driver: createSmtpEmailDriver(smtpEmailConfigSchema.parse(active.config)), driverName: active.driver, instanceId: active.instanceId };
        case "brevo":
          return { driver: createBrevoEmailDriver(brevoEmailConfigSchema.parse(active.config)), driverName: active.driver, instanceId: active.instanceId };
        case "resend":
          return { driver: createResendEmailDriver(resendEmailConfigSchema.parse(active.config)), driverName: active.driver, instanceId: active.instanceId };
        default:
          return { driver: createMockEmailDriver(mockEmailConfigSchema.parse(active.config)), driverName: "mock", instanceId: active.instanceId };
      }
    }
    return { driver: createMockEmailDriver(mockEmailConfigSchema.parse({})), driverName: "mock", instanceId: null };
  }

  async resolveWhatsapp(): Promise<ResolvedDriver<WhatsappDriver>> {
    const active = await this.registry.findActiveInstance("whatsapp");
    if (active) {
      switch (active.driver) {
        case "whatsapp_cloud":
          return { driver: createWhatsappCloudDriver(whatsappCloudConfigSchema.parse(active.config)), driverName: active.driver, instanceId: active.instanceId };
        default:
          return { driver: createMockWhatsappDriver(mockWhatsappConfigSchema.parse(active.config)), driverName: "mock", instanceId: active.instanceId };
      }
    }
    return { driver: createMockWhatsappDriver(mockWhatsappConfigSchema.parse({})), driverName: "mock", instanceId: null };
  }

  async resolve(channel: NotificationChannel): Promise<ResolvedDriver<SmsDriver | EmailDriver | WhatsappDriver>> {
    if (channel === "sms") return this.resolveSms();
    if (channel === "email") return this.resolveEmail();
    return this.resolveWhatsapp();
  }

  async send(channel: NotificationChannel, to: string, subject: string | null, body: string): Promise<{ driverName: string; instanceId: string | null }> {
    if (channel === "email") {
      const { driver, driverName, instanceId } = await this.resolveEmail();
      await driver.send({ to, subject: subject ?? "", html: body.replace(/\n/g, "<br/>"), text: body });
      return { driverName, instanceId };
    }
    if (channel === "whatsapp") {
      const { driver, driverName, instanceId } = await this.resolveWhatsapp();
      await driver.send(to, body);
      return { driverName, instanceId };
    }
    const { driver, driverName, instanceId } = await this.resolveSms();
    await driver.send(to, body);
    return { driverName, instanceId };
  }
}
