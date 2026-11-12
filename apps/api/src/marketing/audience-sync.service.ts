import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { AudienceSync, Prisma } from "@clothing/db";
import {
  createGoogleAudienceDriver,
  createMetaAudienceDriver,
  createMockAudienceDriver,
  googleAudienceConfigSchema,
  metaAudienceConfigSchema,
  mockAudienceConfigSchema,
  type AudienceDriver,
} from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { ProviderRegistryService } from "../providers/provider-registry.service";
import { SegmentsService } from "../customers/segments.service";
import { isUniqueViolation } from "../common/document-number";
import type { AuthenticatedStaff } from "../common/types";
import type { AudienceSyncDto } from "./dto";

const PAGE = 5000;
const AUTO_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Segment → ad-platform audience sync (docs/PROJECT_SPEC.md §8.2 Customers
 * "audience sync to Meta/Google (phase 2)", §16 M13). Uploads hashed phone
 * and email of a segment's live members; with
 * `marketing.audienceSync.requireConsent` (default on) only customers who
 * opted in to at least one marketing channel are included. Add-only: the
 * platforms dedupe re-uploads, but members who leave the segment stay in the
 * platform list until it's recreated (docs/DECISIONS.md).
 */
@Injectable()
export class AudienceSyncService {
  private readonly logger = new Logger(AudienceSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly registry: ProviderRegistryService,
    private readonly segments: SegmentsService,
  ) {}

  async list() {
    const [rows, instances, segments] = await Promise.all([
      this.prisma.audienceSync.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.providerInstance.findMany({ where: { capability: "audience" }, select: { id: true, name: true, driver: true, enabled: true } }),
      this.prisma.segment.findMany({ select: { id: true, name: true } }),
    ]);
    return {
      syncs: rows.map((r) => ({ ...r, provider: instances.find((i) => i.id === r.providerInstanceId) ?? null, segment: segments.find((s) => s.id === r.segmentId) ?? null })),
      providers: instances,
    };
  }

  private async getSync(id: string): Promise<AudienceSync> {
    const row = await this.prisma.audienceSync.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: "AUDIENCE_SYNC_NOT_FOUND", message: "Audience sync not found" });
    return row;
  }

  async create(dto: AudienceSyncDto, actor: AuthenticatedStaff) {
    await this.segments.get(dto.segmentId);
    const instance = await this.prisma.providerInstance.findUnique({ where: { id: dto.providerInstanceId } });
    if (!instance || instance.capability !== "audience") throw new BadRequestException({ code: "NOT_AUDIENCE_PROVIDER", message: "Pick an audience provider from Integrations." });
    try {
      const row = await this.prisma.audienceSync.create({ data: dto });
      await this.audit.record({ actorType: "staff", actorId: actor.id, action: "audience_sync.create", entityType: "audience_sync", entityId: row.id, after: row });
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) throw new BadRequestException({ code: "ALREADY_SYNCED", message: "This segment already syncs to that provider." });
      throw error;
    }
  }

  async setAutoSync(id: string, autoSync: boolean, actor: AuthenticatedStaff) {
    const before = await this.getSync(id);
    const row = await this.prisma.audienceSync.update({ where: { id }, data: { autoSync } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "audience_sync.update", entityType: "audience_sync", entityId: id, before, after: row });
    return row;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.getSync(id);
    await this.prisma.audienceSync.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "audience_sync.delete", entityType: "audience_sync", entityId: id, before });
  }

  private async driverFor(instanceId: string): Promise<AudienceDriver> {
    const instance = await this.prisma.providerInstance.findUnique({ where: { id: instanceId } });
    if (!instance || instance.capability !== "audience" || !instance.enabled) throw new BadRequestException({ code: "AUDIENCE_PROVIDER_UNAVAILABLE", message: "That audience provider is missing or disabled." });
    const config = this.registry.decryptConfig(instance.config);
    switch (instance.driver) {
      case "meta_custom_audience":
        return createMetaAudienceDriver(metaAudienceConfigSchema.parse(config));
      case "google_customer_match":
        return createGoogleAudienceDriver(googleAudienceConfigSchema.parse(config));
      default:
        return createMockAudienceDriver(mockAudienceConfigSchema.parse(config));
    }
  }

  async memberWhere(segmentId: string): Promise<Prisma.CustomerWhereInput> {
    const requireConsent = await this.settings.getValue<boolean>("marketing.audienceSync.requireConsent");
    return {
      AND: [
        { deletedAt: null, status: "active", OR: [{ phone: { not: null } }, { email: { not: null } }] },
        this.segments.whereFor(await this.segments.get(segmentId)),
        ...(requireConsent ? [{ OR: [{ marketingConsentSms: true }, { marketingConsentEmail: true }, { marketingConsentWhatsapp: true }] }] : []),
      ],
    };
  }

  /** Starts a sync and returns at once; the admin polls the row's status. */
  async startSync(id: string, actor: AuthenticatedStaff | null) {
    if (!(await this.settings.getValue<boolean>("marketing.audienceSync.enabled"))) throw new BadRequestException({ code: "AUDIENCE_SYNC_DISABLED", message: "Audience sync is turned off in Settings → marketing." });
    const claimed = await this.prisma.audienceSync.updateMany({ where: { id, status: { not: "running" } }, data: { status: "running", lastError: null } });
    if (claimed.count === 0) throw new BadRequestException({ code: "ALREADY_RUNNING", message: "This audience is already syncing." });
    if (actor) await this.audit.record({ actorType: "staff", actorId: actor.id, action: "audience_sync.run", entityType: "audience_sync", entityId: id });
    void this.runSync(id);
    return this.getSync(id);
  }

  async runSync(id: string): Promise<void> {
    const sync = await this.getSync(id);
    try {
      const driver = await this.driverFor(sync.providerInstanceId);
      const audienceId = await driver.ensureAudience(sync.name, sync.externalAudienceId);
      if (audienceId !== sync.externalAudienceId) await this.prisma.audienceSync.update({ where: { id }, data: { externalAudienceId: audienceId } });
      const where = await this.memberWhere(sync.segmentId);
      let cursor: string | undefined;
      let total = 0;
      for (;;) {
        const page = await this.prisma.customer.findMany({ where: { AND: [where, ...(cursor ? [{ id: { gt: cursor } }] : [])] }, select: { id: true, phone: true, email: true }, orderBy: { id: "asc" }, take: PAGE });
        if (page.length === 0) break;
        const result = await driver.addMembers(audienceId, page);
        total += result.received;
        cursor = page.at(-1)!.id;
        if (page.length < PAGE) break;
      }
      await this.prisma.audienceSync.update({ where: { id }, data: { status: "succeeded", lastSyncedAt: new Date(), lastMemberCount: total } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Audience sync ${id} failed: ${message}`);
      await this.prisma.audienceSync.update({ where: { id }, data: { status: "failed", lastError: message } });
    }
  }

  /** Daily auto-sync, one audience per tick so a slow platform never stalls the scheduler. */
  async autoSyncSweep(now = new Date()): Promise<void> {
    if (!(await this.settings.getValue<boolean>("marketing.audienceSync.enabled"))) return;
    const due = await this.prisma.audienceSync.findFirst({
      where: { autoSync: true, status: { not: "running" }, OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(now.getTime() - AUTO_SYNC_INTERVAL_MS) } }] },
      orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    });
    if (!due) return;
    const claimed = await this.prisma.audienceSync.updateMany({ where: { id: due.id, status: { not: "running" } }, data: { status: "running", lastError: null } });
    if (claimed.count === 1) await this.runSync(due.id);
  }
}
