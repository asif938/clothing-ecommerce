import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { CallLog, CallStatus, ProviderInstance } from "@clothing/db";
import { normalizeBdPhone } from "@clothing/shared";
import {
  createGenericTelephonyDriver,
  createMockTelephonyDriver,
  genericTelephonyConfigSchema,
  mockTelephonyConfigSchema,
  type TelephonyDriver,
} from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ProviderRegistryService } from "../providers/provider-registry.service";
import type { AuthenticatedStaff } from "../common/types";
import type { StartCallDto } from "./dto";

const TERMINAL: CallStatus[] = ["completed", "no_answer", "busy", "failed"];

/**
 * Click-to-call (docs/PROJECT_SPEC.md §8.2, §16 M15). With an enabled
 * `telephony` provider the call is placed through it (it rings the agent's
 * own phone, then the customer) and its status webhook updates the call
 * log. Without one, the API still logs the call and returns a `tel:` link —
 * the same fallback the order screen already had.
 */
@Injectable()
export class TelephonyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: ProviderRegistryService,
  ) {}

  driverFor(instance: ProviderInstance): { driver: TelephonyDriver; webhookSecret: string | null } {
    const raw = this.registry.decryptConfig(instance.config);
    if (instance.driver === "generic_http") {
      const config = genericTelephonyConfigSchema.parse(raw);
      return { driver: createGenericTelephonyDriver(config), webhookSecret: config.webhookSecret ?? null };
    }
    return { driver: createMockTelephonyDriver(mockTelephonyConfigSchema.parse(raw)), webhookSecret: null };
  }

  private async activeInstance(): Promise<ProviderInstance | null> {
    const active = await this.registry.findActiveInstance("telephony");
    return active ? await this.prisma.providerInstance.findUnique({ where: { id: active.instanceId } }) : null;
  }

  async status(actor: AuthenticatedStaff) {
    const [instance, staff] = await Promise.all([this.activeInstance(), this.prisma.staffUser.findUnique({ where: { id: actor.id }, select: { phone: true } })]);
    return { provider: instance ? { id: instance.id, name: instance.name, driver: instance.driver } : null, myPhone: staff?.phone ?? null };
  }

  async setMyPhone(actor: AuthenticatedStaff, phone: string | null) {
    const normalized = phone ? normalizeBdPhone(phone) : null;
    if (phone && !normalized) throw new BadRequestException({ code: "INVALID_PHONE", message: "Enter a Bangladeshi mobile number." });
    const before = await this.prisma.staffUser.findUnique({ where: { id: actor.id }, select: { phone: true } });
    await this.prisma.staffUser.update({ where: { id: actor.id }, data: { phone: normalized } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "staff.phone", entityType: "staff_user", entityId: actor.id, before, after: { phone: normalized } });
    return { myPhone: normalized };
  }

  async startCall(dto: StartCallDto, actor: AuthenticatedStaff): Promise<{ call: CallLog; mode: "provider" | "tel"; telUrl: string }> {
    const phone = normalizeBdPhone(dto.phone);
    if (!phone) throw new BadRequestException({ code: "INVALID_PHONE", message: "That isn't a Bangladeshi mobile number." });
    const telUrl = `tel:${phone}`;
    const instance = await this.activeInstance();
    const base = { staffId: actor.id, customerId: dto.customerId ?? null, orderId: dto.orderId ?? null, conversationId: dto.conversationId ?? null, phone };

    if (!instance) {
      const call = await this.prisma.callLog.create({ data: { ...base, driver: "tel", status: "initiated" } });
      await this.audit.record({ actorType: "staff", actorId: actor.id, action: "call.start", entityType: "call_log", entityId: call.id, after: call });
      return { call, mode: "tel", telUrl };
    }

    const staff = await this.prisma.staffUser.findUnique({ where: { id: actor.id }, select: { phone: true } });
    if (!staff?.phone) throw new BadRequestException({ code: "AGENT_PHONE_REQUIRED", message: "Add your own phone number on Support → Calls first — the provider rings you, then the customer." });

    let call = await this.prisma.callLog.create({ data: { ...base, providerInstanceId: instance.id, driver: instance.driver, status: "initiated" } });
    try {
      const { driver } = this.driverFor(instance);
      const result = await driver.startCall({ agentNumber: staff.phone, customerNumber: phone, reference: call.id });
      call = await this.prisma.callLog.update({ where: { id: call.id }, data: { externalId: result.externalId } });
    } catch (error) {
      call = await this.prisma.callLog.update({ where: { id: call.id }, data: { status: "failed", error: (error instanceof Error ? error.message : "Call failed").slice(0, 500), endedAt: new Date() } });
    }
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "call.start", entityType: "call_log", entityId: call.id, after: call });
    if (call.status === "failed") throw new BadRequestException({ code: "CALL_FAILED", message: call.error ?? "The provider couldn't place the call.", callId: call.id, telUrl });
    return { call, mode: "provider", telUrl };
  }

  /** Status webhook from the provider. The shared secret (if configured) must match. */
  async webhook(instanceId: string, payload: unknown, secret: string | undefined): Promise<{ ok: boolean }> {
    const instance = await this.prisma.providerInstance.findUnique({ where: { id: instanceId } });
    if (!instance || instance.capability !== "telephony") throw new NotFoundException("Unknown telephony provider");
    const { driver, webhookSecret } = this.driverFor(instance);
    if (webhookSecret && secret !== webhookSecret) throw new ForbiddenException({ code: "INVALID_WEBHOOK_SECRET", message: "Webhook secret missing or wrong." });
    const update = driver.parseWebhook(payload);
    if (!update) return { ok: false };
    const call = await this.prisma.callLog.findFirst({
      where: { providerInstanceId: instanceId, OR: [...(update.reference ? [{ id: update.reference }] : []), ...(update.externalId ? [{ externalId: update.externalId }] : [])] },
    });
    if (!call) return { ok: false };
    await this.prisma.callLog.update({
      where: { id: call.id },
      data: {
        status: update.status,
        ...(update.externalId && !call.externalId ? { externalId: update.externalId } : {}),
        ...(update.durationSeconds !== undefined && update.durationSeconds !== null ? { durationSeconds: update.durationSeconds } : {}),
        ...(update.recordingUrl ? { recordingUrl: update.recordingUrl } : {}),
        ...(TERMINAL.includes(update.status) ? { endedAt: new Date() } : {}),
      },
    });
    return { ok: true };
  }

  async list(query: { staffId?: string; orderId?: string; page: number; pageSize: number }) {
    const where = { ...(query.staffId ? { staffId: query.staffId } : {}), ...(query.orderId ? { orderId: query.orderId } : {}) };
    const [total, items] = await Promise.all([
      this.prisma.callLog.count({ where }),
      this.prisma.callLog.findMany({ where, orderBy: { startedAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    ]);
    const staffIds = [...new Set(items.map((i) => i.staffId).filter((id): id is string => !!id))];
    const staff = staffIds.length ? await this.prisma.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } }) : [];
    const names = new Map(staff.map((s) => [s.id, s.name]));
    return { total, page: query.page, pageSize: query.pageSize, items: items.map((i) => ({ ...i, staffName: i.staffId ? (names.get(i.staffId) ?? null) : null })) };
  }

  /** Staff marks how a plain `tel:` call went (no provider to report it). */
  async setOutcome(id: string, status: CallStatus, durationSeconds: number | null, actor: AuthenticatedStaff) {
    const before = await this.prisma.callLog.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Call not found");
    if (before.staffId !== actor.id) throw new ForbiddenException({ code: "FORBIDDEN", message: "Only the caller can record the outcome." });
    const after = await this.prisma.callLog.update({ where: { id }, data: { status, durationSeconds, ...(TERMINAL.includes(status) ? { endedAt: new Date() } : {}) } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "call.outcome", entityType: "call_log", entityId: id, before, after });
    return after;
  }
}
