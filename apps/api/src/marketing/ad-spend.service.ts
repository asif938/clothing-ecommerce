import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AdPlatform, Prisma } from "@clothing/db";
import { computeRoas, platformForUtmSource } from "@clothing/shared/marketing";
import type { AdSpendSourceMap } from "@clothing/shared/settings";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { parseWorkbookRows } from "../import-export/workbook";
import { dhakaDateKey } from "../common/dhaka-time";
import type { AuthenticatedStaff } from "../common/types";
import { parseCount, parseSpendDate, spendToPoisha } from "./ad-spend";
import type { AdSpendImportDto, AdSpendInspectDto, DateRangeDto } from "./dto";

const MAX_ERRORS = 50;

/** Plain-date bounds for a Dhaka-day range (ad spend dates are calendar dates). */
function dateBounds(from: Date, to: Date): { gte: Date; lte: Date } {
  return { gte: new Date(`${dhakaDateKey(from)}T00:00:00.000Z`), lte: new Date(`${dhakaDateKey(to)}T00:00:00.000Z`) };
}

/**
 * Ad spend import + ROAS (docs/PROJECT_SPEC.md §5.10 `ad_spend`, §8.2
 * Marketing "Ad spend import (CSV) and ROAS report", §16 M13). Import is
 * file-first with staff column mapping (same inspect → map → import flow as
 * M12's COD files); re-importing a day replaces that day's numbers per
 * campaign. ROAS joins spend with orders on utm_source → platform (admin map)
 * and utm_campaign → campaign id or name.
 */
@Injectable()
export class AdSpendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  private readRows(fileName: string, contentBase64: string): Record<string, unknown>[] {
    const lower = fileName.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx") && !lower.endsWith(".xls")) throw new BadRequestException({ code: "UNSUPPORTED_FILE", message: "Upload a .csv, .xlsx or .xls file" });
    try {
      return parseWorkbookRows(Buffer.from(contentBase64, "base64"), fileName);
    } catch {
      throw new BadRequestException({ code: "UNREADABLE_FILE", message: "Couldn't read that file" });
    }
  }

  inspect(dto: AdSpendInspectDto) {
    const rows = this.readRows(dto.fileName, dto.contentBase64);
    return { headers: rows[0] ? Object.keys(rows[0]) : [], rowCount: rows.length, sample: rows.slice(0, 5) };
  }

  async import(dto: AdSpendImportDto, actor: AuthenticatedStaff) {
    const rows = this.readRows(dto.fileName, dto.contentBase64);
    const batch = randomUUID();
    const errors: { row: number; message: string }[] = [];
    // Collapse duplicates inside the file (e.g. one row per ad set) into one row per day × campaign.
    const merged = new Map<string, { date: Date; campaignId: string; campaignName: string; spend: number; impressions: number; clicks: number }>();
    rows.forEach((row, index) => {
      const date = parseSpendDate(row[dto.mapping.date], dto.dateFormat);
      const campaignName = String(row[dto.mapping.campaignName] ?? "").trim();
      const spend = spendToPoisha(row[dto.mapping.spend], dto.exchangeRate);
      const fail = (message: string) => errors.length < MAX_ERRORS && errors.push({ row: index + 2, message });
      if (!date) return fail("Unreadable date");
      if (!campaignName) return fail("Missing campaign name");
      if (spend === null) return fail("Unreadable spend amount");
      const campaignId = dto.mapping.campaignId ? String(row[dto.mapping.campaignId] ?? "").trim() : "";
      const key = `${date.toISOString()}|${campaignId}|${campaignName}`;
      const current = merged.get(key) ?? { date, campaignId, campaignName, spend: 0, impressions: 0, clicks: 0 };
      current.spend += spend;
      current.impressions += dto.mapping.impressions ? parseCount(row[dto.mapping.impressions]) : 0;
      current.clicks += dto.mapping.clicks ? parseCount(row[dto.mapping.clicks]) : 0;
      merged.set(key, current);
    });

    let imported = 0;
    for (const r of merged.values()) {
      await this.prisma.adSpend.upsert({
        where: { date_platform_campaignId_campaignName: { date: r.date, platform: dto.platform, campaignId: r.campaignId, campaignName: r.campaignName } },
        create: { ...r, platform: dto.platform, importBatch: batch },
        update: { spend: r.spend, impressions: r.impressions, clicks: r.clicks, importBatch: batch },
      });
      imported += 1;
    }
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "ad_spend.import", entityType: "ad_spend", entityId: batch, after: { fileName: dto.fileName, platform: dto.platform, imported, skipped: rows.length - [...merged.values()].length, exchangeRate: dto.exchangeRate ?? null } });
    return { batch, imported, rowsRead: rows.length, errors };
  }

  async list(query: DateRangeDto) {
    return this.prisma.adSpend.findMany({ where: { date: dateBounds(query.from, query.to), ...(query.platform ? { platform: query.platform } : {}) }, orderBy: [{ date: "desc" }, { spend: "desc" }], take: 2000 });
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.prisma.adSpend.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: "AD_SPEND_NOT_FOUND", message: "Row not found" });
    await this.prisma.adSpend.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "ad_spend.delete", entityType: "ad_spend", entityId: id, before });
  }

  async removeBatch(batch: string, actor: AuthenticatedStaff) {
    const result = await this.prisma.adSpend.deleteMany({ where: { importBatch: batch } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "ad_spend.delete_batch", entityType: "ad_spend", entityId: batch, after: { deleted: result.count } });
    return { deleted: result.count };
  }

  async roas(query: DateRangeDto) {
    const [sourceMap, basis] = await Promise.all([
      this.settings.getValue<AdSpendSourceMap>("marketing.adSpend.utmSourceMap"),
      this.settings.getValue<"placed" | "delivered">("marketing.roas.revenueBasis"),
    ]);
    const orderWhere: Prisma.OrderWhereInput =
      basis === "delivered"
        ? { deliveredAt: { gte: query.from, lte: query.to }, status: { in: ["delivered", "partially_delivered", "completed"] } }
        : { createdAt: { gte: query.from, lte: query.to }, status: { notIn: ["cancelled", "expired", "pending_payment"] } };
    const [spendRows, orders] = await Promise.all([
      this.prisma.adSpend.findMany({ where: { date: dateBounds(query.from, query.to), ...(query.platform ? { platform: query.platform } : {}) } }),
      this.prisma.order.findMany({ where: { ...orderWhere, utmSource: { not: null } }, select: { utmSource: true, utmCampaign: true, total: true, refundedTotal: true, createdAt: true, deliveredAt: true } }),
    ]);
    const attributed = orders
      .filter((o) => !query.platform || platformForUtmSource(o.utmSource, sourceMap) === query.platform)
      .map((o) => ({ utmSource: o.utmSource, utmCampaign: o.utmCampaign, revenue: Math.max(0, o.total - o.refundedTotal), day: dhakaDateKey(basis === "delivered" ? (o.deliveredAt ?? o.createdAt) : o.createdAt) }));
    const campaigns = computeRoas(spendRows.map((s) => ({ platform: s.platform as AdPlatform, campaignId: s.campaignId, campaignName: s.campaignName, spend: s.spend, impressions: s.impressions, clicks: s.clicks })), attributed, sourceMap);

    const platforms = new Map<string, { platform: string; spend: number; revenue: number; orders: number }>();
    for (const c of campaigns) {
      const p = platforms.get(c.platform) ?? { platform: c.platform, spend: 0, revenue: 0, orders: 0 };
      p.spend += c.spend;
      p.revenue += c.revenue;
      p.orders += c.orders;
      platforms.set(c.platform, p);
    }
    const days = new Map<string, { day: string; spend: number; revenue: number }>();
    for (const s of spendRows) {
      const day = s.date.toISOString().slice(0, 10);
      const d = days.get(day) ?? { day, spend: 0, revenue: 0 };
      d.spend += s.spend;
      days.set(day, d);
    }
    for (const o of attributed) {
      if (!platformForUtmSource(o.utmSource, sourceMap)) continue;
      const d = days.get(o.day) ?? { day: o.day, spend: 0, revenue: 0 };
      d.revenue += o.revenue;
      days.set(o.day, d);
    }
    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
    return {
      basis,
      totals: { spend: totalSpend, revenue: totalRevenue, orders: campaigns.reduce((s, c) => s + c.orders, 0), roas: totalSpend > 0 ? totalRevenue / totalSpend : null },
      platforms: [...platforms.values()].map((p) => ({ ...p, roas: p.spend > 0 ? p.revenue / p.spend : null })),
      campaigns,
      days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    };
  }
}
