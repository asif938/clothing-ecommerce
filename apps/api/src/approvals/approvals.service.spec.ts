import { describe, expect, it, vi } from "vitest";
import { ApprovalsService } from "./approvals.service";

const requester = { id: "staff-a", name: "Asha", email: "a@x", locale: "en", permissions: new Set<string>(), isSuperAdmin: false, totpEnabled: true };
const approver = { ...requester, id: "staff-b", name: "Babul" };

function makeService(request: Record<string, unknown> | null = null) {
  const prisma = {
    approvalRequest: {
      findFirst: vi.fn(() => Promise.resolve(null)),
      create: vi.fn(() => Promise.resolve({ id: "ap1" })),
      findUnique: vi.fn(() => Promise.resolve(request)),
      findUniqueOrThrow: vi.fn(() => Promise.resolve({ id: "ap1" })),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      update: vi.fn(() => Promise.resolve({})),
    },
    staffUser: { findUnique: vi.fn(() => Promise.resolve({ id: "staff-a", name: "Asha", email: "a@x", locale: "en", totpEnabled: true })) },
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const staffNotifications = { notifyStaffWithPermission: vi.fn(() => Promise.resolve()), notifyStaff: vi.fn(() => Promise.resolve()) };
  const service = new ApprovalsService(prisma as never, audit as never, staffNotifications as never);
  return { service, prisma, audit, staffNotifications };
}

const pending = { id: "ap1", type: "order_edit", entityType: "order", entityId: "o1", summary: "Edit", payload: { orderId: "o1" }, requestedBy: "staff-a", status: "pending" };

describe("ApprovalsService.request", () => {
  it("stores the request, audits it and notifies approvers", async () => {
    const { service, prisma, staffNotifications, audit } = makeService();
    await service.request({ type: "order_edit", entityType: "order", entityId: "o1", summary: "Override", payload: { a: 1 } }, requester);
    expect(prisma.approvalRequest.create).toHaveBeenCalled();
    expect(staffNotifications.notifyStaffWithPermission).toHaveBeenCalledWith(expect.objectContaining({ permission: "approvals.decide" }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "approval.request" }));
  });
  it("returns the existing open request instead of duplicating it", async () => {
    const { service, prisma } = makeService();
    prisma.approvalRequest.findFirst.mockResolvedValueOnce({ id: "existing" } as never);
    await expect(service.request({ type: "order_edit", entityType: "order", entityId: "o1", summary: "x", payload: {} }, requester)).resolves.toEqual({ id: "existing" });
    expect(prisma.approvalRequest.create).not.toHaveBeenCalled();
  });
});

describe("ApprovalsService.decide", () => {
  it("replays the stored action as the requester when approved", async () => {
    const { service } = makeService(pending);
    const executor = vi.fn(() => Promise.resolve());
    service.registerExecutor("order_edit", executor);
    await service.decide("ap1", true, null, approver);
    expect(executor).toHaveBeenCalledWith({ orderId: "o1" }, expect.objectContaining({ id: "staff-a" }));
  });
  it("does not execute when rejected", async () => {
    const { service, prisma } = makeService(pending);
    const executor = vi.fn(() => Promise.resolve());
    service.registerExecutor("order_edit", executor);
    await service.decide("ap1", false, "no", approver);
    expect(executor).not.toHaveBeenCalled();
    expect(prisma.approvalRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "rejected" }) }));
  });
  it("forbids approving your own request", async () => {
    const { service } = makeService(pending);
    await expect(service.decide("ap1", true, null, requester)).rejects.toMatchObject({ response: { code: "SELF_APPROVAL" } });
  });
  it("refuses an already-decided request", async () => {
    const { service } = makeService({ ...pending, status: "approved" });
    await expect(service.decide("ap1", true, null, approver)).rejects.toMatchObject({ response: { code: "ALREADY_DECIDED" } });
  });
  it("loses the race gracefully when another approver claims it first", async () => {
    const { service, prisma } = makeService(pending);
    prisma.approvalRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    const executor = vi.fn(() => Promise.resolve());
    service.registerExecutor("order_edit", executor);
    await expect(service.decide("ap1", true, null, approver)).rejects.toMatchObject({ response: { code: "ALREADY_DECIDED" } });
    expect(executor).not.toHaveBeenCalled();
  });
  it("marks the request failed when the replay throws", async () => {
    const { service, prisma } = makeService(pending);
    service.registerExecutor("order_edit", () => Promise.reject(new Error("order already shipped")));
    await service.decide("ap1", true, null, approver);
    expect(prisma.approvalRequest.update).toHaveBeenCalledWith({ where: { id: "ap1" }, data: { status: "failed", error: "order already shipped" } });
  });
});
