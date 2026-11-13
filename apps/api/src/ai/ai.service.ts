import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { AiFeatureConfig, ProviderInstance } from "@clothing/db";
import {
  AI_DEFAULT_TONE,
  AI_FEATURE_DEFINITIONS,
  AI_FEATURES,
  budgetState,
  estimateAiCostMicroUsd,
  parseAiOutput,
  type AiFeature,
  type AiOutput,
} from "@clothing/shared/ai";
import { renderTemplate } from "@clothing/shared/notifications";
import {
  anthropicAiConfigSchema,
  createAnthropicAiDriver,
  createGeminiDriver,
  createMockAiDriver,
  createOpenAiDriver,
  geminiConfigSchema,
  mockAiConfigSchema,
  openAiConfigSchema,
  type AiDriver,
  type AiImageInput,
} from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { ProviderRegistryService } from "../providers/provider-registry.service";
import { StaffNotificationsService } from "../notifications/staff-notifications.service";
import type { AuthenticatedStaff } from "../common/types";
import type { UpdateAiConfigDto } from "./dto";

const SYSTEM_PROMPT =
  "You are a careful copywriter for an online clothing store in Bangladesh. Follow the instructions exactly, never invent facts that are not given, and reply with the JSON object requested and nothing else.";

interface ResolvedProvider {
  instance: ProviderInstance;
  driver: AiDriver;
  defaultModel: string;
  inputCentsPerMTok: number;
  outputCentsPerMTok: number;
}

export interface GenerateRequest<F extends AiFeature> {
  feature: F;
  variables: Record<string, string>;
  images?: AiImageInput[];
  /** null for system/storefront calls (e.g. visual search, §16 M14). */
  actor: AuthenticatedStaff | null;
  entity?: { type: string; id: string };
}

export interface GenerateResult<F extends AiFeature> {
  output: AiOutput<F>;
  usageLogId: string;
  model: string;
  estCostMicroUsd: number;
}

/** First day of the UTC month — budgets are per calendar month, matching how the AI vendors bill. */
export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function monthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Multi-provider AI (docs/PROJECT_SPEC.md §10.4, §16 M13). Each feature has
 * its own config row (provider, model, parameters, versioned prompt,
 * monthly cost/token budgets). Every call:
 *  1. checks `ai.enabled`, the feature switch and its budgets plus the
 *     store-wide `ai.monthlyBudgetCents` — a hard stop once spent;
 *  2. tries the feature's provider, then (with `ai.fallbackToNextProvider`)
 *     every other enabled AI provider in priority order;
 *  3. validates the reply against the feature's output contract (an invalid
 *     reply counts as a failure and falls through like an error);
 *  4. logs usage + estimated cost per attempt in `ai_usage_logs`, and alerts
 *     staff with `ai.manage` once per month when a budget crosses the alert
 *     threshold.
 * Switching provider/model is a config change — no code (Phase 2 acceptance).
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly registry: ProviderRegistryService,
    private readonly staffNotifications: StaffNotificationsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Feature configs
  // ---------------------------------------------------------------------------

  async featureConfig(feature: AiFeature): Promise<AiFeatureConfig> {
    const existing = await this.prisma.aiFeatureConfig.findUnique({ where: { feature } });
    if (existing) return existing;
    const template = AI_FEATURE_DEFINITIONS[feature].defaultPrompt;
    return this.prisma.aiFeatureConfig.upsert({
      where: { feature },
      update: {},
      create: { feature, promptTemplate: template, promptVersion: 1, versions: { create: { version: 1, template } } },
    });
  }

  async spentThisMonth(feature?: AiFeature): Promise<{ costMicroUsd: number; tokens: number; calls: number }> {
    const agg = await this.prisma.aiUsageLog.aggregate({
      where: { createdAt: { gte: monthStart() }, ...(feature ? { feature } : {}) },
      _sum: { estCostMicroUsd: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    });
    return { costMicroUsd: agg._sum.estCostMicroUsd ?? 0, tokens: (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0), calls: agg._count._all };
  }

  async listConfigs() {
    const [providers, alertPercent, globalBudgetCents, enabled, globalSpent] = await Promise.all([
      this.prisma.providerInstance.findMany({ where: { capability: "ai" }, select: { id: true, name: true, driver: true, enabled: true, isDefault: true, priority: true }, orderBy: [{ isDefault: "desc" }, { priority: "desc" }] }),
      this.settings.getValue<number>("ai.budgetAlertPercent"),
      this.settings.getValue<number | null>("ai.monthlyBudgetCents"),
      this.settings.getValue<boolean>("ai.enabled"),
      this.spentThisMonth(),
    ]);
    const features = [];
    for (const feature of AI_FEATURES) {
      const config = await this.featureConfig(feature);
      const spent = await this.spentThisMonth(feature);
      const definition = AI_FEATURE_DEFINITIONS[feature];
      features.push({
        ...config,
        label: definition.label,
        help: definition.help,
        variables: definition.variables,
        usesImages: definition.usesImages,
        defaultPrompt: definition.defaultPrompt,
        spent,
        budget: budgetState(spent.costMicroUsd, config.monthlyBudgetCents, alertPercent),
      });
    }
    return { enabled, providers, features, global: { budgetCents: globalBudgetCents, spent: globalSpent, budget: budgetState(globalSpent.costMicroUsd, globalBudgetCents, alertPercent) } };
  }

  async updateConfig(feature: AiFeature, dto: UpdateAiConfigDto, actor: AuthenticatedStaff) {
    const before = await this.featureConfig(feature);
    if (dto.providerInstanceId) {
      const instance = await this.prisma.providerInstance.findUnique({ where: { id: dto.providerInstanceId } });
      if (!instance || instance.capability !== "ai") throw new BadRequestException({ code: "NOT_AI_PROVIDER", message: "Pick an AI provider from Integrations." });
    }
    const promptChanged = dto.promptTemplate !== undefined && dto.promptTemplate !== before.promptTemplate;
    const config = await this.prisma.$transaction(async (tx) => {
      const nextVersion = before.promptVersion + 1;
      if (promptChanged) await tx.aiPromptVersion.create({ data: { featureConfigId: before.id, version: nextVersion, template: dto.promptTemplate!, createdBy: actor.id } });
      return tx.aiFeatureConfig.update({
        where: { feature },
        data: {
          ...(dto.providerInstanceId !== undefined ? { providerInstanceId: dto.providerInstanceId } : {}),
          ...(dto.model !== undefined ? { model: dto.model } : {}),
          ...(dto.temperature !== undefined ? { temperature: dto.temperature } : {}),
          ...(dto.effort !== undefined ? { effort: dto.effort } : {}),
          ...(dto.maxTokens !== undefined ? { maxTokens: dto.maxTokens } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.monthlyBudgetCents !== undefined ? { monthlyBudgetCents: dto.monthlyBudgetCents } : {}),
          ...(dto.monthlyTokenBudget !== undefined ? { monthlyTokenBudget: dto.monthlyTokenBudget } : {}),
          ...(promptChanged ? { promptTemplate: dto.promptTemplate!, promptVersion: nextVersion } : {}),
        },
      });
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "ai_feature_config.update", entityType: "ai_feature_config", entityId: config.id, before, after: config });
    return config;
  }

  async versions(feature: AiFeature) {
    const config = await this.featureConfig(feature);
    return this.prisma.aiPromptVersion.findMany({ where: { featureConfigId: config.id }, orderBy: { version: "desc" } });
  }

  async restoreVersion(feature: AiFeature, version: number, actor: AuthenticatedStaff) {
    const config = await this.featureConfig(feature);
    const row = await this.prisma.aiPromptVersion.findUnique({ where: { featureConfigId_version: { featureConfigId: config.id, version } } });
    if (!row) throw new NotFoundException({ code: "PROMPT_VERSION_NOT_FOUND", message: "Prompt version not found" });
    return this.updateConfig(feature, { promptTemplate: row.template }, actor);
  }

  // ---------------------------------------------------------------------------
  // Providers
  // ---------------------------------------------------------------------------

  private resolve(instance: ProviderInstance): ResolvedProvider {
    const raw = this.registry.decryptConfig(instance.config);
    switch (instance.driver) {
      case "anthropic": {
        const c = anthropicAiConfigSchema.parse(raw);
        return { instance, driver: createAnthropicAiDriver(c), defaultModel: c.defaultModel, inputCentsPerMTok: c.inputCentsPerMTok, outputCentsPerMTok: c.outputCentsPerMTok };
      }
      case "openai": {
        const c = openAiConfigSchema.parse(raw);
        return { instance, driver: createOpenAiDriver(c), defaultModel: c.defaultModel, inputCentsPerMTok: c.inputCentsPerMTok, outputCentsPerMTok: c.outputCentsPerMTok };
      }
      case "gemini": {
        const c = geminiConfigSchema.parse(raw);
        return { instance, driver: createGeminiDriver(c), defaultModel: c.defaultModel, inputCentsPerMTok: c.inputCentsPerMTok, outputCentsPerMTok: c.outputCentsPerMTok };
      }
      default: {
        const c = mockAiConfigSchema.parse(raw);
        return { instance, driver: createMockAiDriver(c), defaultModel: c.defaultModel, inputCentsPerMTok: c.inputCentsPerMTok, outputCentsPerMTok: c.outputCentsPerMTok };
      }
    }
  }

  /** Provider order for one call: the feature's own choice first, then (optionally) every other enabled AI provider. */
  async providerChain(config: AiFeatureConfig): Promise<ProviderInstance[]> {
    const enabled = await this.prisma.providerInstance.findMany({ where: { capability: "ai", enabled: true }, orderBy: [{ isDefault: "desc" }, { priority: "desc" }, { createdAt: "asc" }] });
    const preferred = config.providerInstanceId ? enabled.find((i) => i.id === config.providerInstanceId) : enabled[0];
    if (!preferred) return [];
    const fallback = await this.settings.getValue<boolean>("ai.fallbackToNextProvider");
    return fallback ? [preferred, ...enabled.filter((i) => i.id !== preferred.id)] : [preferred];
  }

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------

  private async assertBudgets(feature: AiFeature, config: AiFeatureConfig): Promise<void> {
    const [spent, globalBudgetCents] = await Promise.all([this.spentThisMonth(feature), this.settings.getValue<number | null>("ai.monthlyBudgetCents")]);
    const stop = (message: string) => {
      throw new HttpException({ code: "AI_BUDGET_EXCEEDED", message }, HttpStatus.PAYMENT_REQUIRED);
    };
    if (budgetState(spent.costMicroUsd, config.monthlyBudgetCents, 100) === "exceeded") stop("This feature's monthly AI budget is used up.");
    if (config.monthlyTokenBudget !== null && spent.tokens >= config.monthlyTokenBudget) stop("This feature's monthly token budget is used up.");
    if (globalBudgetCents !== null && budgetState((await this.spentThisMonth()).costMicroUsd, globalBudgetCents, 100) === "exceeded") stop("The store's monthly AI budget is used up.");
  }

  private async alertIfNeeded(feature: AiFeature, config: AiFeatureConfig): Promise<void> {
    const month = monthKey();
    if (config.alertedMonth === month) return;
    const [alertPercent, spent] = await Promise.all([this.settings.getValue<number>("ai.budgetAlertPercent"), this.spentThisMonth(feature)]);
    const tokenAlert = config.monthlyTokenBudget !== null && spent.tokens * 100 >= config.monthlyTokenBudget * alertPercent;
    if (budgetState(spent.costMicroUsd, config.monthlyBudgetCents, alertPercent) === "ok" && !tokenAlert) return;
    const claimed = await this.prisma.aiFeatureConfig.updateMany({ where: { id: config.id, OR: [{ alertedMonth: null }, { alertedMonth: { not: month } }] }, data: { alertedMonth: month } });
    if (claimed.count === 0) return;
    const label = AI_FEATURE_DEFINITIONS[feature].label;
    await this.staffNotifications.notifyStaffWithPermission({
      type: "ai_budget",
      title: { bn: `AI বাজেট: ${label.bn}`, en: `AI budget: ${label.en}` },
      body: { bn: `এই মাসের বাজেটের ${alertPercent}% বা তার বেশি খরচ হয়েছে।`, en: `${alertPercent}% or more of this month's budget has been used.` },
      link: "/ai",
      permission: "ai.manage",
    });
  }

  async generate<F extends AiFeature>(request: GenerateRequest<F>): Promise<GenerateResult<F>> {
    if (!(await this.settings.getValue<boolean>("ai.enabled"))) throw new BadRequestException({ code: "AI_DISABLED", message: "AI assistance is turned off in Settings → ai." });
    const config = await this.featureConfig(request.feature);
    if (!config.enabled) throw new BadRequestException({ code: "AI_FEATURE_DISABLED", message: "This AI feature is turned off." });
    await this.assertBudgets(request.feature, config);

    const chain = await this.providerChain(config);
    if (chain.length === 0) throw new BadRequestException({ code: "AI_NO_PROVIDER", message: "No AI provider is enabled — add one under Integrations → ai." });

    const definition = AI_FEATURE_DEFINITIONS[request.feature];
    const brand = await this.settings.getValue<{ bn?: string; en?: string }>("brand.name");
    const variables = { brand_name: brand?.en || brand?.bn || "", tone: AI_DEFAULT_TONE, ...request.variables };
    const prompt = `${renderTemplate(config.promptTemplate, variables)}\n\n${definition.outputContract}`;
    const errors: string[] = [];

    for (const instance of chain) {
      let provider: ResolvedProvider;
      try {
        provider = this.resolve(instance);
      } catch (error) {
        errors.push(`${instance.name}: ${error instanceof Error ? error.message : "invalid configuration"}`);
        continue;
      }
      // A model chosen for the feature applies to its preferred provider; fallbacks use their own default model.
      const model = instance.id === chain[0]!.id && config.model ? config.model : provider.defaultModel;
      const startedAt = Date.now();
      let usage = { inputTokens: 0, outputTokens: 0 };
      try {
        const reply = await provider.driver.generate({
          model,
          system: SYSTEM_PROMPT,
          prompt,
          images: definition.usesImages ? request.images : undefined,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
          effort: (config.effort as "low" | "medium" | "high" | null) ?? null,
        });
        usage = { inputTokens: reply.inputTokens, outputTokens: reply.outputTokens };
        const output = parseAiOutput(request.feature, reply.text);
        const log = await this.logUsage(request, provider, reply.model, usage, Date.now() - startedAt, "succeeded", null);
        await this.alertIfNeeded(request.feature, config).catch((error: unknown) => this.logger.warn(`AI budget alert failed: ${error instanceof Error ? error.message : "Unknown error"}`));
        return { output, usageLogId: log.id, model: reply.model, estCostMicroUsd: log.estCostMicroUsd };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${instance.name}: ${message}`);
        await this.logUsage(request, provider, model, usage, Date.now() - startedAt, usage.outputTokens > 0 ? "invalid_output" : "failed", message);
        this.logger.warn(`AI ${request.feature} via ${instance.driver} failed: ${message}`);
      }
    }
    throw new HttpException({ code: "AI_FAILED", message: `The AI request failed. ${errors.join(" · ")}` }, HttpStatus.BAD_GATEWAY);
  }

  private logUsage(request: GenerateRequest<AiFeature>, provider: ResolvedProvider, model: string, usage: { inputTokens: number; outputTokens: number }, latencyMs: number, status: string, error: string | null) {
    return this.prisma.aiUsageLog.create({
      data: {
        feature: request.feature,
        providerInstanceId: provider.instance.id,
        driver: provider.instance.driver,
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estCostMicroUsd: estimateAiCostMicroUsd(usage.inputTokens, usage.outputTokens, provider.inputCentsPerMTok, provider.outputCentsPerMTok),
        latencyMs,
        status,
        error: error?.slice(0, 1000) ?? null,
        actorId: request.actor?.id ?? null,
        entityType: request.entity?.type ?? null,
        entityId: request.entity?.id ?? null,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Usage report
  // ---------------------------------------------------------------------------

  async usageReport(month: string) {
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const where = { createdAt: { gte: start, lt: end } };
    const sums = { _sum: { estCostMicroUsd: true, inputTokens: true, outputTokens: true, latencyMs: true }, _count: { _all: true } } as const;
    const [byFeature, byProvider, byStatus, recent] = await Promise.all([
      this.prisma.aiUsageLog.groupBy({ by: ["feature"], where, ...sums }),
      this.prisma.aiUsageLog.groupBy({ by: ["driver", "model"], where, ...sums }),
      this.prisma.aiUsageLog.groupBy({ by: ["status"], where, _count: { _all: true } }),
      this.prisma.aiUsageLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    const row = (g: { _sum: { estCostMicroUsd: number | null; inputTokens: number | null; outputTokens: number | null; latencyMs: number | null }; _count: { _all: number } }) => ({
      calls: g._count._all,
      inputTokens: g._sum.inputTokens ?? 0,
      outputTokens: g._sum.outputTokens ?? 0,
      estCostMicroUsd: g._sum.estCostMicroUsd ?? 0,
      avgLatencyMs: g._count._all ? Math.round((g._sum.latencyMs ?? 0) / g._count._all) : 0,
    });
    const features = byFeature.map((g) => ({ feature: g.feature, ...row(g) }));
    return {
      month,
      totals: features.reduce((t, f) => ({ calls: t.calls + f.calls, inputTokens: t.inputTokens + f.inputTokens, outputTokens: t.outputTokens + f.outputTokens, estCostMicroUsd: t.estCostMicroUsd + f.estCostMicroUsd }), { calls: 0, inputTokens: 0, outputTokens: 0, estCostMicroUsd: 0 }),
      features,
      providers: byProvider.map((g) => ({ driver: g.driver, model: g.model, ...row(g) })),
      statuses: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      recent,
    };
  }
}
