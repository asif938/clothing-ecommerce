import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  getSettingDefinition,
  listPublicSettingDefinitions,
  listSettingDefinitions,
  validateSettingValue,
  type SettingDefinition,
} from "@clothing/shared/settings";
import { decrypt, encrypt, isEncryptedPayload, maskSecret } from "@clothing/shared/crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CacheService } from "../cache/cache.service";
import { RevalidationService } from "../revalidation/revalidation.service";
import type { AuthenticatedStaff } from "../common/types";

const PUBLIC_CONFIG_CACHE_KEY = "settings:public-config";
const PUBLIC_CONFIG_CACHE_TAG = "settings:public-config";

export interface SettingWithValue {
  definition: SettingDefinition;
  value: unknown;
  /** true if a row exists in `settings` for this key (false => using the registry default). */
  isOverridden: boolean;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly revalidation: RevalidationService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  private get encryptionKey(): string {
    return this.config.getOrThrow<string>("APP_ENCRYPTION_KEY");
  }

  /** Resolves one setting's effective value: DB override if present, else the registry default. */
  async getValue<T>(key: string): Promise<T> {
    const definition = getSettingDefinition(key);
    if (!definition) throw new NotFoundException(`Unknown setting "${key}"`);

    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) return definition.default as T;

    if (definition.secret) {
      if (!isEncryptedPayload(row.value)) {
        throw new Error(`Setting "${key}" is marked secret but its stored value isn't an encrypted payload`);
      }
      return JSON.parse(decrypt(row.value, this.encryptionKey)) as T;
    }
    return row.value as T;
  }

  async getAllWithMetadata(): Promise<SettingWithValue[]> {
    const definitions = listSettingDefinitions();
    const rows = await this.prisma.setting.findMany({ where: { key: { in: definitions.map((d) => d.key) } } });
    const rowByKey = new Map(rows.map((r) => [r.key, r]));

    return definitions.map((definition) => {
      const row = rowByKey.get(definition.key);
      if (!row) {
        return { definition, value: definition.default, isOverridden: false };
      }
      if (definition.secret) {
        // Never decrypt for display — admin only sees a masked hint.
        const decrypted = isEncryptedPayload(row.value) ? decrypt(row.value, this.encryptionKey) : "";
        return { definition, value: maskSecret(JSON.parse(decrypted) as string), isOverridden: true };
      }
      return { definition, value: row.value, isOverridden: true };
    });
  }

  /** `GET /store/config` payload: every setting marked `public: true`, by key. Cached and tagged (§4.1). */
  async getPublicConfig(): Promise<Record<string, unknown>> {
    const cached = this.cache.get<Record<string, unknown>>(PUBLIC_CONFIG_CACHE_KEY);
    if (cached) return cached;

    const result: Record<string, unknown> = {};
    for (const definition of listPublicSettingDefinitions()) {
      result[definition.key] = await this.getValue(definition.key);
    }
    this.cache.set(PUBLIC_CONFIG_CACHE_KEY, result, { ttlSeconds: 300, tags: [PUBLIC_CONFIG_CACHE_TAG] });
    return result;
  }

  async setValue(
    key: string,
    rawValue: unknown,
    actor: AuthenticatedStaff,
    context: { ip: string | null; userAgent: string | null },
  ): Promise<void> {
    const definition = getSettingDefinition(key);
    if (!definition) throw new NotFoundException(`Unknown setting "${key}"`);

    if (!actor.permissions.has(definition.permission)) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: `Missing permission "${definition.permission}"` });
    }

    const result = validateSettingValue(key, rawValue);
    if (!result.success) {
      throw new ForbiddenException({ code: "VALIDATION_ERROR", message: result.error });
    }

    const before = await this.getValue(key);
    const storedValue = definition.secret
      ? (encrypt(JSON.stringify(result.data), this.encryptionKey) as unknown)
      : result.data;

    await this.prisma.setting.upsert({
      where: { key },
      update: { value: storedValue as object, updatedBy: actor.id },
      create: { key, value: storedValue as object, updatedBy: actor.id },
    });

    if (definition.public) {
      this.cache.invalidateTag(PUBLIC_CONFIG_CACHE_TAG);
      // Publishing pipeline (docs/PROJECT_SPEC.md §9.6) — a public setting
      // (brand color, header variant, …) reaches the live storefront
      // without a deploy, within seconds.
      await this.revalidation.revalidate(["settings"]);
    }

    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "settings.update",
      entityType: "setting",
      entityId: key,
      before: definition.secret ? maskSecret(String(before)) : before,
      after: definition.secret ? maskSecret(String(result.data)) : result.data,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }
}
