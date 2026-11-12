import { describe, expect, it, vi } from "vitest";
import { ScheduledReportsService } from "./scheduled-reports.service";
import { renderReportHtml } from "./report-catalog";
import { anomalyMessage } from "./anomaly-alerts.service";

const actor = { id: "staff-1", name: "A", email: "a@x", locale: "en", permissions: new Set<string>(["reports.schedule.manage", "reports.read"]), isSuperAdmin: false, totpEnabled: true };

function make(due: Record<string, unknown>[], opts: { enabled?: boolean; claim?: number } = {}) {
  const prisma = {
    scheduledReport: {
      findMany: vi.fn(() => Promise.resolve(due)),
      updateMany: vi.fn(() => Promise.resolve({ count: opts.claim ?? 1 })),
      update: vi.fn(() => Promise.resolve({})),
      create: vi.fn((args: { data: unknown }) => Promise.resolve({ id: "r1", ...(args.data as object) })),
    },
  };
  const settings = { getValue: vi.fn((key: string) => Promise.resolve(key === "reports.scheduled.enabled" ? (opts.enabled ?? true) : 8)) };
  const send = vi.fn(() => Promise.resolve());
  const drivers = { resolveEmail: vi.fn(() => Promise.resolve({ driver: { send } })) };
  const reports = { salesByDay: vi.fn(() => Promise.resolve([{ day: "2026-11-11", orders: 3, revenue: 300_000, cancelled: 0 }])) };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const service = new ScheduledReportsService(prisma as never, audit as never, settings as never, drivers as never, reports as never, {} as never, {} as never);
  return { service, prisma, send, reports };
}

const dueRow = { id: "r1", name: "Daily sales", reportKey: "sales", frequency: "daily", recipients: ["a@x.com", "b@x.com"], locale: "en", isActive: true, nextRunAt: new Date("2026-11-12T02:00:00Z") };

describe("ScheduledReportsService.runDue", () => {
  it("claims, sends to every recipient for the previous day, and schedules the next run", async () => {
    const { service, prisma, send, reports } = make([dueRow]);
    const result = await service.runDue(new Date("2026-11-12T02:00:30Z"));
    expect(result).toEqual({ sent: 1 });
    expect(prisma.scheduledReport.updateMany).toHaveBeenCalledWith({ where: { id: "r1", nextRunAt: dueRow.nextRunAt }, data: { nextRunAt: new Date("2026-11-13T02:00:00Z") } });
    expect(reports.salesByDay).toHaveBeenCalledWith(new Date("2026-11-10T18:00:00Z"), new Date("2026-11-11T18:00:00Z"));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "a@x.com", html: expect.stringContaining("৳3,000") }));
  });

  it("skips a run another worker already claimed", async () => {
    const { service, send } = make([dueRow], { claim: 0 });
    await expect(service.runDue(new Date("2026-11-12T02:00:30Z"))).resolves.toEqual({ sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing when switched off", async () => {
    const { service, prisma } = make([dueRow], { enabled: false });
    await service.runDue();
    expect(prisma.scheduledReport.findMany).not.toHaveBeenCalled();
  });

  it("records the error and keeps going when sending fails", async () => {
    const { service, prisma, send } = make([dueRow]);
    send.mockRejectedValueOnce(new Error("SMTP down"));
    await service.runDue(new Date("2026-11-12T02:00:30Z"));
    expect(prisma.scheduledReport.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { lastError: "SMTP down" } });
  });
});

describe("ScheduledReportsService.create", () => {
  it("refuses to schedule a report the staff member can't view", async () => {
    const { service } = make([]);
    await expect(service.create({ name: "P", reportKey: "profit", frequency: "weekly", recipients: ["a@x.com"], locale: "bn", isActive: true }, actor)).rejects.toMatchObject({ response: { code: "FORBIDDEN" } });
  });
});

describe("renderReportHtml", () => {
  it("escapes values so report data can't inject markup", () => {
    const html = renderReportHtml("T", "P", { columns: [{ key: "term", header: { bn: "t", en: "Term" } }], rows: [{ term: '<img src=x onerror="1">' }] }, "en", "none");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("anomalyMessage", () => {
  it("reads naturally in both languages", () => {
    expect(anomalyMessage({ metric: "orders", direction: "down", severity: "warning", observed: 8, expected: 20, change: -0.6 }, "2026-11-11")).toEqual({
      bn: "2026-11-11: অর্ডার সংখ্যা কমেছে 60% — 8 (গড় 20)",
      en: "2026-11-11: Orders down 60% — 8 vs 20 average",
    });
  });
});
