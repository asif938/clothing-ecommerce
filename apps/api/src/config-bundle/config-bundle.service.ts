import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, type NotificationChannel, type NotificationEvent, type AttributeType, type PageStatus } from "@clothing/db";
import { getSettingDefinition, validateSettingValue } from "@clothing/shared/settings";
import { CONFIG_BUNDLE_SECTION_KEYS, CONFIG_BUNDLE_VERSION, type ConfigBundleSection } from "@clothing/shared/analytics";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { RevalidationService } from "../revalidation/revalidation.service";
import type { AuthenticatedStaff } from "../common/types";
import {
  BUNDLE_FORMAT,
  bundleSchema,
  emptyPlan,
  findIdReferences,
  menuItemsFromPortable,
  menuItemsToPortable,
  orderByParent,
  sameValue,
  type ConfigBundle,
  type MenuItem,
  type SectionPlan,
  type SlugLookup,
} from "./bundle";

export interface ImportOptions {
  sections: ConfigBundleSection[];
  /** Report what would change without writing anything. */
  dryRun: boolean;
  /** Publish pages that were published in the bundle (otherwise new pages arrive as drafts and existing pages keep their live content). */
  publishPages: boolean;
}

export type ImportReport = { dryRun: boolean; sections: Partial<Record<ConfigBundleSection, SectionPlan>> };

const json = (value: unknown) => value as Prisma.InputJsonValue;
const jsonOrNull = (value: unknown) => (value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue));
type Tx = Prisma.TransactionClient;

/**
 * Config bundle export/import (docs/PROJECT_SPEC.md §4 "Config export/import",
 * §16 M17) — bootstraps a new brand on a fresh deployment. Import only ever
 * creates or updates (it never deletes), settings go through
 * `SettingsService.setValue` so each one still needs its own permission and
 * is audited, and everything else is applied in one transaction so a bad
 * bundle cannot half-apply.
 */
@Injectable()
export class ConfigBundleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly revalidation: RevalidationService,
  ) {}

  // ------------------------------------------------------------------ export

  async export(sections: ConfigBundleSection[], actor: AuthenticatedStaff): Promise<ConfigBundle> {
    const wanted = new Set(sections);
    const data: ConfigBundle["data"] = {};

    if (wanted.has("settings")) {
      const rows = await this.prisma.setting.findMany({ orderBy: { key: "asc" } });
      data.settings = Object.fromEntries(rows.filter((r) => {
        const def = getSettingDefinition(r.key);
        return def !== undefined && !def.secret;
      }).map((r) => [r.key, r.value]));
    }
    if (wanted.has("uiStrings")) {
      data.uiStrings = (await this.prisma.uiString.findMany({ orderBy: { key: "asc" } })).map((s) => ({ key: s.key, bn: s.bn, en: s.en }));
    }
    if (wanted.has("messageTemplates")) {
      data.messageTemplates = (await this.prisma.messageTemplate.findMany({ orderBy: [{ event: "asc" }, { channel: "asc" }] })).map((t) => ({
        event: t.event,
        channel: t.channel,
        isActive: t.isActive,
        subjectBn: t.subjectBn,
        subjectEn: t.subjectEn,
        bodyBn: t.bodyBn,
        bodyEn: t.bodyEn,
      }));
    }
    if (wanted.has("categories")) {
      const categories = await this.prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { slug: "asc" }] });
      const slugById = new Map(categories.map((c) => [c.id, c.slug]));
      data.categories = categories.map((c) => ({
        slug: c.slug,
        parentSlug: c.parentId ? (slugById.get(c.parentId) ?? null) : null,
        name: c.name as never,
        description: (c.description as never) ?? null,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        seoTitle: (c.seoTitle as never) ?? null,
        seoDescription: (c.seoDescription as never) ?? null,
      }));
    }
    if (wanted.has("attributes")) {
      const attributes = await this.prisma.attribute.findMany({ include: { values: { orderBy: [{ sortOrder: "asc" }, { slug: "asc" }] } }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
      data.attributes = attributes.map((a) => ({
        code: a.code,
        name: a.name as never,
        type: a.type,
        isFilterable: a.isFilterable,
        isVisibleOnPdp: a.isVisibleOnPdp,
        sortOrder: a.sortOrder,
        values: a.values.map((v) => ({ slug: v.slug, value: v.value as never, colorHex: v.colorHex, sortOrder: v.sortOrder })),
      }));
    }
    if (wanted.has("menus")) {
      const menus = await this.prisma.menu.findMany({ orderBy: { key: "asc" } });
      const slugById = await this.slugLookupById(menus.flatMap((m) => collectTargets(m.items as MenuItem[])));
      data.menus = menus.map((m) => ({ key: m.key, name: m.name, items: menuItemsToPortable(m.items as MenuItem[], slugById) }));
    }
    if (wanted.has("pages")) {
      data.pages = (await this.prisma.page.findMany({ where: { deletedAt: null }, orderBy: { slug: "asc" } })).map((p) => ({
        slug: p.slug,
        title: p.title,
        status: p.status,
        blocksDraft: p.blocksDraft,
        blocksPublished: p.blocksPublished ?? null,
        seoTitle: (p.seoTitle as never) ?? null,
        seoDescription: (p.seoDescription as never) ?? null,
        noindex: p.noindex,
        isSystem: p.isSystem,
        needsContent: p.needsContent,
      }));
    }

    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "config_bundle.export", entityType: "config_bundle", entityId: "export", after: { sections } });
    return { format: BUNDLE_FORMAT, version: CONFIG_BUNDLE_VERSION, exportedAt: new Date().toISOString(), sections: CONFIG_BUNDLE_SECTION_KEYS.filter((s) => wanted.has(s)), data };
  }

  /** id → slug for every menu target, per entity type. */
  private async slugLookupById(targets: { type: string; id: string }[]): Promise<SlugLookup> {
    const idsOf = (type: string) => [...new Set(targets.filter((t) => t.type === type).map((t) => t.id))];
    const [categories, collections, products, pages] = await Promise.all([
      this.prisma.category.findMany({ where: { id: { in: idsOf("category") } }, select: { id: true, slug: true } }),
      this.prisma.collection.findMany({ where: { id: { in: idsOf("collection") } }, select: { id: true, slug: true } }),
      this.prisma.product.findMany({ where: { id: { in: idsOf("product") } }, select: { id: true, slug: true } }),
      this.prisma.page.findMany({ where: { id: { in: idsOf("page") } }, select: { id: true, slug: true } }),
    ]);
    const map = (rows: { id: string; slug: string }[]) => new Map(rows.map((r) => [r.id, r.slug]));
    return { category: map(categories), collection: map(collections), product: map(products), page: map(pages) };
  }

  // ------------------------------------------------------------------ import

  parse(raw: unknown): ConfigBundle {
    const parsed = bundleSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException({ code: "BUNDLE_INVALID", message: `Not a valid config bundle: ${parsed.error.issues[0]?.path.join(".") || "root"} — ${parsed.error.issues[0]?.message ?? "invalid"}`, details: parsed.error.issues.slice(0, 10) });
    }
    return parsed.data;
  }

  async import(raw: unknown, options: ImportOptions, actor: AuthenticatedStaff, context: { ip: string | null; userAgent: string | null }): Promise<ImportReport> {
    const bundle = this.parse(raw);
    const wanted = new Set(options.sections);
    const report: ImportReport = { dryRun: options.dryRun, sections: {} };

    if (wanted.has("settings") && bundle.data.settings) report.sections.settings = await this.importSettings(bundle.data.settings, options, actor, context);

    const structural = (["uiStrings", "messageTemplates", "categories", "attributes", "menus", "pages"] as const).filter((s) => wanted.has(s) && bundle.data[s] !== undefined);
    if (structural.length > 0) {
      const apply = async (tx: Tx | PrismaService) => {
        const dry = options.dryRun;
        if (structural.includes("uiStrings")) report.sections.uiStrings = await this.importUiStrings(tx, bundle.data.uiStrings!, dry);
        if (structural.includes("messageTemplates")) report.sections.messageTemplates = await this.importTemplates(tx, bundle.data.messageTemplates!, dry);
        if (structural.includes("categories")) report.sections.categories = await this.importCategories(tx, bundle.data.categories!, dry);
        if (structural.includes("attributes")) report.sections.attributes = await this.importAttributes(tx, bundle.data.attributes!, dry);
        if (structural.includes("pages")) report.sections.pages = await this.importPages(tx, bundle.data.pages!, options);
        if (structural.includes("menus")) report.sections.menus = await this.importMenus(tx, bundle.data.menus!, dry, new Set(bundle.data.categories?.map((c) => c.slug) ?? []), new Set(bundle.data.pages?.map((p) => p.slug) ?? []));
      };
      if (options.dryRun) await apply(this.prisma);
      else await this.prisma.$transaction((tx) => apply(tx), { timeout: 60_000, maxWait: 10_000 });
    }

    if (!options.dryRun) {
      await this.audit.record({
        actorType: "staff",
        actorId: actor.id,
        action: "config_bundle.import",
        entityType: "config_bundle",
        entityId: "import",
        ip: context.ip,
        userAgent: context.userAgent,
        after: { sections: options.sections, publishPages: options.publishPages, counts: Object.fromEntries(Object.entries(report.sections).map(([k, v]) => [k, { created: v.created, updated: v.updated, skipped: v.skipped.length }])) },
      });
      await this.revalidation.revalidate(["settings", "pages", "menus", "catalog"]);
    }
    return report;
  }

  private async importSettings(values: Record<string, unknown>, options: ImportOptions, actor: AuthenticatedStaff, context: { ip: string | null; userAgent: string | null }): Promise<SectionPlan> {
    const plan = emptyPlan();
    for (const [key, value] of Object.entries(values)) {
      const def = getSettingDefinition(key);
      if (!def) {
        plan.skipped.push({ id: key, reason: "Unknown setting" });
        continue;
      }
      if (def.secret) {
        plan.skipped.push({ id: key, reason: "Secrets are never imported" });
        continue;
      }
      const valid = validateSettingValue(key, value);
      if (!valid.success) {
        plan.skipped.push({ id: key, reason: valid.error });
        continue;
      }
      if (!actor.permissions.has(def.permission)) {
        plan.skipped.push({ id: key, reason: `You need the "${def.permission}" permission` });
        continue;
      }
      if (sameValue(await this.settings.getValue(key), valid.data)) {
        plan.unchanged += 1;
        continue;
      }
      if (!options.dryRun) await this.settings.setValue(key, valid.data, actor, context);
      plan.updated += 1;
    }
    return plan;
  }

  private async importUiStrings(db: Tx | PrismaService, rows: NonNullable<ConfigBundle["data"]["uiStrings"]>, dry: boolean): Promise<SectionPlan> {
    const plan = emptyPlan();
    const existing = new Map((await db.uiString.findMany()).map((s) => [s.key, s]));
    for (const row of rows) {
      const current = existing.get(row.key);
      if (current && current.bn === row.bn && current.en === row.en) plan.unchanged += 1;
      else {
        if (!dry) await db.uiString.upsert({ where: { key: row.key }, create: row, update: { bn: row.bn, en: row.en } });
        if (current) plan.updated += 1;
        else plan.created += 1;
      }
    }
    return plan;
  }

  private async importTemplates(db: Tx | PrismaService, rows: NonNullable<ConfigBundle["data"]["messageTemplates"]>, dry: boolean): Promise<SectionPlan> {
    const plan = emptyPlan();
    const existing = new Map((await db.messageTemplate.findMany()).map((t) => [`${t.event}:${t.channel}`, t]));
    for (const row of rows) {
      const id = `${row.event}:${row.channel}`;
      const current = existing.get(id);
      const data = { isActive: row.isActive, subjectBn: row.subjectBn, subjectEn: row.subjectEn, bodyBn: row.bodyBn, bodyEn: row.bodyEn };
      if (current && sameValue({ isActive: current.isActive, subjectBn: current.subjectBn, subjectEn: current.subjectEn, bodyBn: current.bodyBn, bodyEn: current.bodyEn }, data)) {
        plan.unchanged += 1;
        continue;
      }
      if (!dry) {
        try {
          await db.messageTemplate.upsert({
            where: { event_channel: { event: row.event as NotificationEvent, channel: row.channel as NotificationChannel } },
            create: { event: row.event as NotificationEvent, channel: row.channel as NotificationChannel, ...data },
            update: data,
          });
        } catch {
          plan.skipped.push({ id, reason: "Unknown event or channel on this deployment" });
          continue;
        }
      }
      if (current) plan.updated += 1;
      else plan.created += 1;
    }
    return plan;
  }

  private async importCategories(db: Tx | PrismaService, rows: NonNullable<ConfigBundle["data"]["categories"]>, dry: boolean): Promise<SectionPlan> {
    const plan = emptyPlan();
    const existing = new Map((await db.category.findMany({ select: { id: true, slug: true, parentId: true, name: true, description: true, sortOrder: true, isActive: true, seoTitle: true, seoDescription: true } })).map((c) => [c.slug, c]));
    const idBySlug = new Map([...existing].map(([slug, c]) => [slug, c.id]));
    const { ordered, orphans } = orderByParent(rows, new Set(existing.keys()));
    for (const orphan of orphans) plan.skipped.push({ id: orphan.slug, reason: `Parent category "${orphan.parentSlug}" is not in the bundle or on this deployment` });

    for (const row of ordered) {
      const current = existing.get(row.slug);
      const parentId = row.parentSlug ? (idBySlug.get(row.parentSlug) ?? null) : null;
      const same = current && current.parentId === parentId && current.sortOrder === row.sortOrder && current.isActive === row.isActive && sameValue(current.name, row.name) && sameValue(current.description ?? null, row.description) && sameValue(current.seoTitle ?? null, row.seoTitle) && sameValue(current.seoDescription ?? null, row.seoDescription);
      if (same) {
        plan.unchanged += 1;
        continue;
      }
      if (row.parentSlug && !idBySlug.has(row.parentSlug) && !dry) {
        plan.skipped.push({ id: row.slug, reason: `Parent "${row.parentSlug}" could not be resolved` });
        continue;
      }
      const data = { name: json(row.name), description: jsonOrNull(row.description), sortOrder: row.sortOrder, isActive: row.isActive, seoTitle: jsonOrNull(row.seoTitle), seoDescription: jsonOrNull(row.seoDescription) };
      if (!dry) {
        if (current) await db.category.update({ where: { id: current.id }, data: { ...data, parentId } });
        else {
          const created = await db.category.create({ data: { slug: row.slug, parentId, ...data } });
          idBySlug.set(row.slug, created.id);
        }
      } else if (!current) idBySlug.set(row.slug, `(new:${row.slug})`);
      if (current) plan.updated += 1;
      else plan.created += 1;
    }
    return plan;
  }

  private async importAttributes(db: Tx | PrismaService, rows: NonNullable<ConfigBundle["data"]["attributes"]>, dry: boolean): Promise<SectionPlan> {
    const plan = emptyPlan();
    const existing = new Map((await db.attribute.findMany({ include: { values: true } })).map((a) => [a.code, a]));
    for (const row of rows) {
      const current = existing.get(row.code);
      const attrData = { name: json(row.name), type: row.type as AttributeType, isFilterable: row.isFilterable, isVisibleOnPdp: row.isVisibleOnPdp, sortOrder: row.sortOrder };
      const currentValues = new Map((current?.values ?? []).map((v) => [v.slug, v]));
      const valuesChanged = row.values.some((v) => {
        const c = currentValues.get(v.slug);
        return !c || !sameValue(c.value, v.value) || c.colorHex !== v.colorHex || c.sortOrder !== v.sortOrder;
      });
      const attrSame = current && sameValue({ name: current.name, type: current.type, isFilterable: current.isFilterable, isVisibleOnPdp: current.isVisibleOnPdp, sortOrder: current.sortOrder }, { name: row.name, type: row.type, isFilterable: row.isFilterable, isVisibleOnPdp: row.isVisibleOnPdp, sortOrder: row.sortOrder });
      if (attrSame && !valuesChanged) {
        plan.unchanged += 1;
        continue;
      }
      if (!dry) {
        const attribute = current ? await db.attribute.update({ where: { id: current.id }, data: attrData }) : await db.attribute.create({ data: { code: row.code, ...attrData } });
        for (const v of row.values) {
          const valueData = { value: json(v.value), colorHex: v.colorHex, sortOrder: v.sortOrder };
          await db.attributeValue.upsert({ where: { attributeId_slug: { attributeId: attribute.id, slug: v.slug } }, create: { attributeId: attribute.id, slug: v.slug, ...valueData }, update: valueData });
        }
      }
      if (current) plan.updated += 1;
      else plan.created += 1;
    }
    return plan;
  }

  private async importPages(db: Tx | PrismaService, rows: NonNullable<ConfigBundle["data"]["pages"]>, options: ImportOptions): Promise<SectionPlan> {
    const plan = emptyPlan();
    const dry = options.dryRun;
    const existing = new Map((await db.page.findMany()).map((p) => [p.slug, p]));
    for (const row of rows) {
      const current = existing.get(row.slug);
      if (current?.deletedAt) {
        plan.skipped.push({ id: row.slug, reason: "A deleted page with this slug exists — restore or rename it first" });
        continue;
      }
      const refs = findIdReferences([row.blocksDraft, row.blocksPublished]);
      if (refs.length > 0) plan.warnings.push(`${row.slug}: blocks reference ids from the source store (${refs.join(", ")}) — re-pick those images/products after import`);

      const publish = options.publishPages && row.status === "published";
      const content = { title: row.title, blocksDraft: json(row.blocksDraft), seoTitle: jsonOrNull(row.seoTitle), seoDescription: jsonOrNull(row.seoDescription), noindex: row.noindex };
      const livePart = publish ? { status: "published" as PageStatus, blocksPublished: json(row.blocksPublished ?? row.blocksDraft), needsContent: false } : {};
      const same = current && sameValue({ title: current.title, blocksDraft: current.blocksDraft, seoTitle: current.seoTitle ?? null, seoDescription: current.seoDescription ?? null, noindex: current.noindex }, { title: row.title, blocksDraft: row.blocksDraft, seoTitle: row.seoTitle, seoDescription: row.seoDescription, noindex: row.noindex }) && (!publish || (current.status === "published" && sameValue(current.blocksPublished, row.blocksPublished ?? row.blocksDraft)));
      if (same) {
        plan.unchanged += 1;
        continue;
      }
      if (!dry) {
        if (current) await db.page.update({ where: { id: current.id }, data: { ...content, ...livePart } });
        else await db.page.create({ data: { slug: row.slug, isSystem: row.isSystem, needsContent: row.needsContent, status: "draft", ...content, ...livePart } });
      }
      if (current) plan.updated += 1;
      else plan.created += 1;
    }
    return plan;
  }

  private async importMenus(db: Tx | PrismaService, rows: NonNullable<ConfigBundle["data"]["menus"]>, dry: boolean, incomingCategories: Set<string>, incomingPages: Set<string>): Promise<SectionPlan> {
    const plan = emptyPlan();
    const [categories, collections, products, pages, existingMenus] = await Promise.all([
      db.category.findMany({ select: { id: true, slug: true } }),
      db.collection.findMany({ select: { id: true, slug: true } }),
      db.product.findMany({ select: { id: true, slug: true } }),
      db.page.findMany({ where: { deletedAt: null }, select: { id: true, slug: true } }),
      db.menu.findMany(),
    ]);
    const map = (list: { id: string; slug: string }[]) => new Map(list.map((r) => [r.slug, r.id]));
    const idBySlug: SlugLookup = { category: map(categories), collection: map(collections), product: map(products), page: map(pages) };
    // In a dry run the categories/pages that the same import would create do not exist yet — treat them as resolvable.
    if (dry) {
      for (const slug of incomingCategories) if (!idBySlug.category.has(slug)) idBySlug.category.set(slug, `(new:${slug})`);
      for (const slug of incomingPages) if (!idBySlug.page.has(slug)) idBySlug.page.set(slug, `(new:${slug})`);
    }
    const existing = new Map(existingMenus.map((m) => [m.key, m]));
    for (const row of rows) {
      const { items, unresolved } = menuItemsFromPortable(row.items as MenuItem[], idBySlug);
      if (unresolved.length > 0) plan.warnings.push(`${row.key}: ${unresolved.length} link(s) point at things that do not exist here (${[...new Set(unresolved)].slice(0, 5).join(", ")})`);
      const current = existing.get(row.key);
      if (current && current.name === row.name && sameValue(current.items, items)) {
        plan.unchanged += 1;
        continue;
      }
      if (!dry) {
        if (current) await db.menu.update({ where: { id: current.id }, data: { name: row.name, items: json(items) } });
        else await db.menu.create({ data: { key: row.key, name: row.name, items: json(items) } });
      }
      if (current) plan.updated += 1;
      else plan.created += 1;
    }
    return plan;
  }
}

/** Every `{ type, targetId }` in a menu tree that points at another entity. */
function collectTargets(items: MenuItem[]): { type: string; id: string }[] {
  return items.flatMap((item) => [...(item.type && item.targetId ? [{ type: item.type, id: item.targetId }] : []), ...(item.children ? collectTargets(item.children) : [])]);
}
