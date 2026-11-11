import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { StaffNotificationsService } from "../notifications/staff-notifications.service";
import type { AuthenticatedStaff } from "../common/types";

export type ApprovalExecutor = (payload: unknown, requester: AuthenticatedStaff) => Promise<void>;

export interface ApprovalRequestInput {
  type: string;
  entityType: string;
  entityId: string;
  summary: string;
  payload: unknown;
}

/**
 * Approval workflows (docs/PROJECT_SPEC.md §5.10 `approval_requests`, §16
 * M11). A gated action (a price/shipping override on an order, a large
 * refund) is not executed when a staff member without `approvals.bypass`
 * attempts it - the request is stored here instead. Someone holding
 * `approvals.decide` (and who is not the requester - four-eyes) then
 * approves, which *replays* the stored action through the same service
 * method that was gated, or rejects. Feature modules register an executor
 * per `type` in `onModuleInit`, so this module has no dependency on them.
 */
@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);
  private readonly executors = new Map<string, ApprovalExecutor>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly staffNotifications: StaffNotificationsService,
  ) {}

  registerExecutor(type: string, executor: ApprovalExecutor): void {
    this.executors.set(type, executor);
  }

  async request(input: ApprovalRequestInput, requester: AuthenticatedStaff) {
    // One open request per (type, entity): re-submitting the same gated action returns the existing one instead of spamming approvers.
    const existing = await this.prisma.approvalRequest.findFirst({ where: { type: input.type, entityId: input.entityId, status: "pending", requestedBy: requester.id } });
    if (existing) return existing;

    const created = await this.prisma.approvalRequest.create({
      data: { type: input.type, entityType: input.entityType, entityId: input.entityId, summary: input.summary, payload: input.payload as Prisma.InputJsonValue, requestedBy: requester.id },
    });
    await this.audit.record({ actorType: "staff", actorId: requester.id, action: "approval.request", entityType: input.entityType, entityId: input.entityId, after: { approvalId: created.id, type: input.type, summary: input.summary } });
    await this.staffNotifications.notifyStaffWithPermission({
      type: "approval_request",
      permission: "approvals.decide",
      link: "/approvals",
      title: { bn: "অনুমোদনের অনুরোধ", en: "Approval requested" },
      body: { bn: `${requester.name}: ${input.summary}`, en: `${requester.name}: ${input.summary}` },
    });
    return created;
  }

  async list(status?: string) {
    const rows = await this.prisma.approvalRequest.findMany({ where: status ? { status: status as never } : {}, orderBy: { createdAt: "desc" }, take: 200 });
    return await this.withNames(rows);
  }

  async mine(staffId: string) {
    const rows = await this.prisma.approvalRequest.findMany({ where: { requestedBy: staffId }, orderBy: { createdAt: "desc" }, take: 50 });
    return await this.withNames(rows);
  }

  async pendingCount(): Promise<number> {
    return await this.prisma.approvalRequest.count({ where: { status: "pending" } });
  }

  async decide(id: string, approve: boolean, note: string | null, decider: AuthenticatedStaff) {
    const request = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("Approval request not found");
    if (request.status !== "pending") throw new BadRequestException({ code: "ALREADY_DECIDED", message: "This request has already been decided." });
    if (request.requestedBy === decider.id) throw new ForbiddenException({ code: "SELF_APPROVAL", message: "You can't approve your own request." });

    // Claim first so two approvers clicking at once can't both replay the action.
    const claimed = await this.prisma.approvalRequest.updateMany({
      where: { id, status: "pending" },
      data: { status: approve ? "approved" : "rejected", decidedBy: decider.id, decidedAt: new Date(), decisionNote: note },
    });
    if (claimed.count === 0) throw new BadRequestException({ code: "ALREADY_DECIDED", message: "This request has already been decided." });

    let error: string | null = null;
    if (approve) {
      const executor = this.executors.get(request.type);
      try {
        if (!executor) throw new Error(`No executor registered for "${request.type}"`);
        const requester = await this.actorFor(request.requestedBy);
        await executor(request.payload, requester);
      } catch (executionError) {
        error = executionError instanceof Error ? executionError.message : "Unknown error";
        this.logger.error(`Approval ${id} (${request.type}) was approved but failed to execute: ${error}`);
        await this.prisma.approvalRequest.update({ where: { id }, data: { status: "failed", error } });
      }
    }

    await this.audit.record({
      actorType: "staff",
      actorId: decider.id,
      action: approve ? "approval.approve" : "approval.reject",
      entityType: request.entityType,
      entityId: request.entityId,
      after: { approvalId: id, type: request.type, note, error },
    });
    await this.staffNotifications.notifyStaff(request.requestedBy, {
      type: "approval_decision",
      link: "/approvals",
      title: { bn: approve && !error ? "অনুরোধ অনুমোদিত হয়েছে" : error ? "অনুমোদিত, কিন্তু কার্যকর হয়নি" : "অনুরোধ প্রত্যাখ্যাত হয়েছে", en: approve && !error ? "Request approved" : error ? "Approved, but it failed to apply" : "Request rejected" },
      body: { bn: request.summary, en: request.summary },
    });
    return await this.prisma.approvalRequest.findUniqueOrThrow({ where: { id } });
  }

  /** A minimal staff actor for replaying an approved action as the original requester (their permissions were checked when they asked; replay only needs the identity for audit/events). */
  private async actorFor(staffId: string): Promise<AuthenticatedStaff> {
    const staff = await this.prisma.staffUser.findUnique({ where: { id: staffId }, select: { id: true, name: true, email: true, locale: true, totpEnabled: true } });
    if (!staff) throw new Error("The requesting staff member no longer exists");
    return { ...staff, permissions: new Set<string>(), isSuperAdmin: false };
  }

  private async withNames<T extends { requestedBy: string; decidedBy: string | null }>(rows: T[]) {
    const ids = [...new Set(rows.flatMap((r) => [r.requestedBy, r.decidedBy].filter((v): v is string => !!v)))];
    const staff = await this.prisma.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const names = new Map(staff.map((s) => [s.id, s.name]));
    return rows.map((r) => ({ ...r, requestedByName: names.get(r.requestedBy) ?? null, decidedByName: r.decidedBy ? (names.get(r.decidedBy) ?? null) : null }));
  }
}
