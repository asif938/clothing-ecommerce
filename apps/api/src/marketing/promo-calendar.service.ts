import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface CalendarEvent {
  id: string;
  kind: "discount" | "flash_sale" | "announcement" | "popup" | "price_schedule" | "broadcast" | "page";
  title: string | { bn?: string; en?: string };
  start: Date;
  end: Date | null;
  status: string;
  link: string;
}

/**
 * Promo calendar (docs/PROJECT_SPEC.md §8.2 Marketing "Promo calendar
 * (phase 2) showing discounts, flash sales, banners, seasonal themes,
 * scheduled prices", §16 M13). Read-only aggregation of everything that
 * already has a schedule; each event links to the screen that edits it.
 * Seasonal themes don't exist as a scheduled entity yet, so they're not
 * shown (docs/DECISIONS.md).
 */
@Injectable()
export class PromoCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async events(from: Date, to: Date): Promise<CalendarEvent[]> {
    // Overlaps [from, to]: starts before the window ends, and is open-ended or ends after it starts.
    const overlaps = { OR: [{ endsAt: null }, { endsAt: { gte: from } }] };
    const [discounts, flashSales, bars, popups, priceSchedules, broadcasts, pages] = await Promise.all([
      this.prisma.discount.findMany({ where: { startsAt: { lte: to }, ...overlaps, status: { not: "disabled" } }, select: { id: true, name: true, startsAt: true, endsAt: true, status: true }, take: 500 }),
      this.prisma.flashSale.findMany({ where: { startsAt: { lte: to }, endsAt: { gte: from } }, select: { id: true, name: true, startsAt: true, endsAt: true, status: true }, take: 500 }),
      this.prisma.announcementBar.findMany({ where: { startsAt: { not: null, lte: to }, ...overlaps }, select: { id: true, message: true, startsAt: true, endsAt: true, isActive: true }, take: 500 }),
      this.prisma.popup.findMany({ where: { startsAt: { not: null, lte: to }, ...overlaps }, select: { id: true, name: true, startsAt: true, endsAt: true, isActive: true }, take: 500 }),
      this.prisma.priceSchedule.findMany({ where: { startsAt: { lte: to }, ...overlaps, status: { not: "cancelled" } }, select: { id: true, targetType: true, targetId: true, startsAt: true, endsAt: true, status: true }, take: 500 }),
      this.prisma.broadcast.findMany({ where: { scheduledAt: { gte: from, lte: to }, status: { in: ["scheduled", "sending", "sent"] } }, select: { id: true, name: true, scheduledAt: true, status: true }, take: 500 }),
      this.prisma.page.findMany({ where: { publishAt: { gte: from, lte: to }, deletedAt: null }, select: { id: true, title: true, publishAt: true, status: true }, take: 500 }),
    ]);

    const events: CalendarEvent[] = [
      ...discounts.map((d) => ({ id: d.id, kind: "discount" as const, title: d.name, start: d.startsAt!, end: d.endsAt, status: d.status, link: `/discounts` })),
      ...flashSales.map((f) => ({ id: f.id, kind: "flash_sale" as const, title: f.name as CalendarEvent["title"], start: f.startsAt, end: f.endsAt, status: f.status, link: `/flash-sales` })),
      ...bars.map((b) => ({ id: b.id, kind: "announcement" as const, title: b.message as CalendarEvent["title"], start: b.startsAt!, end: b.endsAt, status: b.isActive ? "active" : "inactive", link: `/cms/announcements` })),
      ...popups.map((p) => ({ id: p.id, kind: "popup" as const, title: p.name, start: p.startsAt!, end: p.endsAt, status: p.isActive ? "active" : "inactive", link: `/cms/announcements` })),
      ...priceSchedules.map((p) => ({ id: p.id, kind: "price_schedule" as const, title: `${p.targetType}: ${p.targetId}`, start: p.startsAt, end: p.endsAt, status: p.status, link: `/price-schedules` })),
      ...broadcasts.map((b) => ({ id: b.id, kind: "broadcast" as const, title: b.name, start: b.scheduledAt!, end: null, status: b.status, link: `/marketing/broadcasts/${b.id}` })),
      ...pages.map((p) => ({ id: p.id, kind: "page" as const, title: p.title, start: p.publishAt!, end: null, status: p.status, link: `/cms/pages/${p.id}` })),
    ];
    return events.sort((a, b) => a.start.getTime() - b.start.getTime());
  }
}
