import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { decrypt, encrypt, isEncryptedPayload, maskSecret } from "@clothing/shared/crypto";
import { getDriverDefinition, type ProviderCapability, type ProviderTestResult } from "@clothing/shared/providers";
import { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Resolves `provider_instances` rows against the static driver catalog
 * (docs/PROJECT_SPEC.md §4.3): decrypts config, validates it against the
 * driver's own zod schema, and wraps `testConnection` calls with timing +
 * `provider_logs`. Retries/backoff/circuit-breaking (rule 3) are deferred to
 * the milestone that adds the first driver actually making repeated network
 * calls under load (payment/courier, M5-M6) — see docs/DECISIONS.md.
 */
@Injectable()
export class ProviderRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  private get encryptionKey(): string {
    return this.config.getOrThrow<string>("APP_ENCRYPTION_KEY");
  }

  encryptConfig(config: Record<string, unknown>): object {
    return encrypt(JSON.stringify(config), this.encryptionKey) as unknown as object;
  }

  decryptConfig(value: unknown): Record<string, unknown> {
    if (!isEncryptedPayload(value)) throw new Error("provider_instances.config is not an encrypted payload");
    return JSON.parse(decrypt(value, this.encryptionKey)) as Record<string, unknown>;
  }

  /** Redacts secret fields for API responses — never send decrypted secrets to the admin UI. */
  maskConfigForDisplay(capability: ProviderCapability, driver: string, config: Record<string, unknown>): Record<string, unknown> {
    const definition = getDriverDefinition(capability, driver);
    if (!definition) return config;
    const masked = { ...config };
    for (const field of definition.secretFields) {
      if (typeof masked[field] === "string") masked[field] = maskSecret(masked[field] as string);
    }
    return masked;
  }

  validateConfig(capability: ProviderCapability, driver: string, config: unknown): Record<string, unknown> {
    const definition = getDriverDefinition(capability, driver);
    if (!definition) {
      throw new BadRequestException({ code: "UNKNOWN_DRIVER", message: `No driver "${driver}" for capability "${capability}"` });
    }
    const result = definition.configSchema.safeParse(config);
    if (!result.success) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: result.error.message });
    }
    return result.data as Record<string, unknown>;
  }

  async testConnection(instanceId: string): Promise<ProviderTestResult> {
    const instance = await this.prisma.providerInstance.findUnique({ where: { id: instanceId } });
    if (!instance) throw new NotFoundException("Provider instance not found");

    const definition = getDriverDefinition(instance.capability as ProviderCapability, instance.driver);
    if (!definition) {
      throw new BadRequestException({ code: "UNKNOWN_DRIVER", message: `No driver "${instance.driver}" for capability "${instance.capability}"` });
    }

    const config = this.decryptConfig(instance.config);
    const startedAt = Date.now();
    let result: ProviderTestResult;
    try {
      result = await definition.testConnection(config);
    } catch (error) {
      result = { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
    const durationMs = Date.now() - startedAt;

    await this.prisma.providerLog.create({
      data: {
        providerInstanceId: instance.id,
        operation: "testConnection",
        status: result.ok ? "ok" : "error",
        durationMs,
        // ProviderTestResult.details is Record<string, unknown> — not structurally
        // provable as JSON-safe, but it only ever holds driver-reported JSON data.
        response: { message: result.message, details: result.details ?? null } as Prisma.InputJsonValue,
      },
    });

    return result;
  }
}
