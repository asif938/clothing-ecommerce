import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Experiment, type ExperimentGoal } from "@clothing/db";
import { validateBlocks, type BlockInstanceLike } from "@clothing/blocks/schemas";
import {
  announcementTargetSchema,
  announcementVariantPayloadSchema,
  blockTargetSchema,
  CONTROL_KEY,
  offerVariantPayloadSchema,
  requiredVisitorsPerVariant,
  summarizeExperiment,
  variantListProblems,
  type AnnouncementTarget,
  type BlockTarget,
  type ExperimentKind,
  type ExperimentVariant,
  type OfferVariantPayload,
  type VariantStats,
} from "@clothing/shared/personalization";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { RevalidationService } from "../revalidation/revalidation.service";
import type { AuthenticatedStaff } from "../common/types";
import { ExperimentAssignmentsService } from "./experiment-assignments.service";
import type { CompleteExperimentDto, CreateExperimentDto, UpdateExperimentDto } from "./dto";

const ENTITY = "experiment";
/** The relative uplift the admin's "visitors needed" hint is sized for. */
const HINT_MIN_DETECTABLE_UPLIFT = 0.1;

interface BlockLike {
  id: string;
  type: string;
  props: unknown;
}

function json(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

/**
 * A/B tests admin (docs/PROJECT_SPEC.md §16 M14): create/edit drafts,
 * start/pause/resume/complete, results with significance, and "apply the
 * winner". Variants and target are frozen once a test has started —
 * changing them mid-test would mix two different experiments in one result.
 */
@Injectable()
export class ExperimentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly revalidation: RevalidationService,
    private readonly assignments: ExperimentAssignmentsService,
  ) {}

  async list(status?: Experiment["status"]) {
    const rows = await this.prisma.experiment.findMany({ where: status ? { status } : {}, orderBy: [{ status: "asc" }, { updatedAt: "desc" }] });
    const counts = rows.length
      ? await this.prisma.experimentExposure.groupBy({ by: ["experimentId"], where: { experimentId: { in: rows.map((r) => r.id) } }, _count: { _all: true } })
      : [];
    const byId = new Map(counts.map((c) => [c.experimentId, c._count._all]));
    return rows.map((row) => ({ ...row, visitors: byId.get(row.id) ?? 0 }));
  }

  async get(id: string): Promise<Experiment> {
    const row = await this.prisma.experiment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Experiment not found");
    return row;
  }

  async create(dto: CreateExperimentDto, actor: AuthenticatedStaff) {
    const { variants, target } = await this.validate(dto.kind, dto.variants, dto.target, actor);
    const row = await this.prisma.experiment.create({
      data: {
        name: dto.name,
        hypothesis: dto.hypothesis ?? null,
        kind: dto.kind,
        goal: dto.goal,
        trafficPercent: dto.trafficPercent,
        variants: variants as unknown as Prisma.InputJsonValue,
        target: json(target),
        createdBy: actor.id,
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "experiment.create", entityType: ENTITY, entityId: row.id, after: row });
    return row;
  }

  async update(id: string, dto: UpdateExperimentDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    if (before.status === "completed") throw new BadRequestException({ code: "EXPERIMENT_COMPLETED", message: "A completed experiment can't be edited — duplicate it instead." });
    const structural = dto.variants !== undefined || dto.target !== undefined || (dto.goal !== undefined && dto.goal !== before.goal);
    if (structural && before.status !== "draft") {
      throw new BadRequestException({ code: "EXPERIMENT_STARTED", message: "Variants, target and goal can't change after a test has started; only name, hypothesis and traffic can." });
    }
    if (dto.trafficPercent !== undefined && before.status !== "draft" && dto.trafficPercent < before.trafficPercent) {
      // Lowering traffic would move some visitors already counted back to the control mid-test.
      throw new BadRequestException({ code: "TRAFFIC_DECREASE", message: "Traffic can only be raised while a test is running or paused." });
    }
    let validated: { variants: ExperimentVariant[]; target: unknown } | null = null;
    if (dto.variants !== undefined || dto.target !== undefined) {
      validated = await this.validate(before.kind, dto.variants ?? (before.variants as ExperimentVariant[]), dto.target !== undefined ? dto.target : before.target, actor);
    }
    const row = await this.prisma.experiment.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.hypothesis !== undefined ? { hypothesis: dto.hypothesis } : {}),
        ...(dto.goal !== undefined ? { goal: dto.goal } : {}),
        ...(dto.trafficPercent !== undefined ? { trafficPercent: dto.trafficPercent } : {}),
        ...(validated ? { variants: validated.variants as unknown as Prisma.InputJsonValue, target: json(validated.target) } : {}),
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "experiment.update", entityType: ENTITY, entityId: id, before, after: row });
    await this.changed(row);
    return row;
  }

  async remove(id: string, actor: AuthenticatedStaff): Promise<void> {
    const before = await this.get(id);
    if (before.status === "running" || before.status === "paused") {
      throw new BadRequestException({ code: "EXPERIMENT_ACTIVE", message: "Complete the test before deleting it." });
    }
    await this.prisma.experiment.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "experiment.delete", entityType: ENTITY, entityId: id, before });
  }

  async start(id: string, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    if (before.status !== "draft" && before.status !== "paused") throw new BadRequestException({ code: "EXPERIMENT_NOT_STARTABLE", message: "Only a draft or paused test can be started." });
    // Re-validate: the page, bar or discounts may have changed since the draft was saved.
    await this.validate(before.kind, before.variants as ExperimentVariant[], before.target, actor);
    await this.assertNoConflict(before);
    const row = await this.prisma.experiment.update({ where: { id }, data: { status: "running", startedAt: before.startedAt ?? new Date(), endedAt: null } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: before.status === "draft" ? "experiment.start" : "experiment.resume", entityType: ENTITY, entityId: id, before, after: row });
    await this.changed(row);
    return row;
  }

  async pause(id: string, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    if (before.status !== "running") throw new BadRequestException({ code: "EXPERIMENT_NOT_RUNNING", message: "Only a running test can be paused." });
    const row = await this.prisma.experiment.update({ where: { id }, data: { status: "paused" } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "experiment.pause", entityType: ENTITY, entityId: id, before, after: row });
    await this.changed(row);
    return row;
  }

  async complete(id: string, dto: CompleteExperimentDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    if (before.status !== "running" && before.status !== "paused") throw new BadRequestException({ code: "EXPERIMENT_NOT_ACTIVE", message: "Only a running or paused test can be completed." });
    const variants = before.variants as ExperimentVariant[];
    const winner = dto.winnerKey ? variants.find((v) => v.key === dto.winnerKey) : undefined;
    if (dto.winnerKey && !winner) throw new BadRequestException({ code: "UNKNOWN_VARIANT", message: `No variant "${dto.winnerKey}".` });

    const applied = dto.apply && winner ? await this.applyWinner(before, winner, variants, actor) : null;
    const row = await this.prisma.experiment.update({ where: { id }, data: { status: "completed", endedAt: new Date(), winnerKey: dto.winnerKey } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "experiment.complete", entityType: ENTITY, entityId: id, before, after: { ...row, applied } });
    await this.changed(row);
    return { experiment: row, applied };
  }

  async results(id: string) {
    const experiment = await this.get(id);
    const variants = experiment.variants as ExperimentVariant[];
    const [confidence, minVisitors] = await Promise.all([
      this.settings.getValue<number>("experiments.confidencePercent"),
      this.settings.getValue<number>("experiments.minVisitorsPerVariant"),
    ]);

    const exposureRows = await this.prisma.experimentExposure.groupBy({ by: ["variantKey"], where: { experimentId: id }, _count: { _all: true } });
    const conversionRows = await this.prisma.$queryRaw<{ variant_key: string; goal: ExperimentGoal; visitors: number; events: number; value: bigint | number }[]>`
      SELECT variant_key, goal, COUNT(DISTINCT visitor_id)::int AS visitors, COUNT(*)::int AS events, COALESCE(SUM(value), 0) AS value
      FROM experiment_conversions WHERE experiment_id = ${id}
      GROUP BY variant_key, goal`;

    const exposures = new Map(exposureRows.map((r) => [r.variantKey, r._count._all]));
    const metric = (key: string, goal: ExperimentGoal) => conversionRows.find((r) => r.variant_key === key && r.goal === goal);

    const stats: VariantStats[] = variants.map((v) => ({
      key: v.key,
      visitors: exposures.get(v.key) ?? 0,
      conversions: metric(v.key, experiment.goal)?.visitors ?? 0,
      revenue: Number(metric(v.key, "purchase")?.value ?? 0),
    }));
    const summary = summarizeExperiment(stats, confidence, minVisitors);
    const control = summary.variants.find((v) => v.key === CONTROL_KEY);

    return {
      experiment,
      confidencePercent: confidence,
      minVisitorsPerVariant: minVisitors,
      summary,
      secondary: variants.map((v) => ({
        key: v.key,
        orders: metric(v.key, "purchase")?.events ?? 0,
        buyers: metric(v.key, "purchase")?.visitors ?? 0,
        revenue: Number(metric(v.key, "purchase")?.value ?? 0),
        addToCartVisitors: metric(v.key, "add_to_cart")?.visitors ?? 0,
        clickVisitors: metric(v.key, "click")?.visitors ?? 0,
      })),
      visitorsNeededPerVariant: control ? requiredVisitorsPerVariant(control.conversionRate, HINT_MIN_DETECTABLE_UPLIFT, confidence) : null,
    };
  }

  /** Pages and announcement bars the editor can target, with the blocks of each published page. */
  async targets() {
    const [pages, bars, discounts] = await Promise.all([
      this.prisma.page.findMany({ where: { deletedAt: null, status: "published" }, select: { id: true, slug: true, title: true, blocksPublished: true }, orderBy: { slug: "asc" } }),
      this.prisma.announcementBar.findMany({ select: { id: true, message: true, isActive: true }, orderBy: { position: "asc" } }),
      this.prisma.discount.findMany({ where: { status: { in: ["active", "scheduled", "draft"] } }, select: { id: true, name: true, type: true, code: true, status: true }, orderBy: { createdAt: "desc" } }),
    ]);
    return {
      pages: pages.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        blocks: ((p.blocksPublished as BlockLike[] | null) ?? []).map((b) => ({ id: b.id, type: b.type, props: b.props })),
      })),
      announcements: bars,
      discounts,
    };
  }

  // ---------------------------------------------------------------------------

  /** Kind-specific checks; returns the variants with block props replaced by their schema-parsed form. */
  private async validate(kind: ExperimentKind, variants: ExperimentVariant[], target: unknown, actor: AuthenticatedStaff): Promise<{ variants: ExperimentVariant[]; target: unknown }> {
    const problems = variantListProblems(kind, variants);
    if (problems.length > 0) throw new BadRequestException({ code: "INVALID_VARIANTS", message: problems.join(" ") });

    if (kind === "block") {
      const parsed = blockTargetSchema.safeParse(target);
      if (!parsed.success) throw new BadRequestException({ code: "INVALID_TARGET", message: "Choose a page and one of its blocks." });
      const block = await this.findPublishedBlock(parsed.data);
      const out = variants.map((variant) => {
        if (variant.key === CONTROL_KEY) return { ...variant, payload: undefined };
        const props = (variant.payload as { props: unknown }).props;
        const { valid, errors } = validateBlocks([{ id: block.id, type: block.type, props } as BlockInstanceLike], actor.isSuperAdmin);
        if (errors.length > 0) throw new BadRequestException({ code: "INVALID_VARIANT_PROPS", message: `Variant "${variant.key}": ${errors[0]!.message}` });
        return { ...variant, payload: { props: valid[0]!.props } };
      });
      return { variants: out, target: parsed.data };
    }

    if (kind === "announcement") {
      const parsed = announcementTargetSchema.safeParse(target);
      if (!parsed.success) throw new BadRequestException({ code: "INVALID_TARGET", message: "Choose an announcement bar." });
      const bar = await this.prisma.announcementBar.findUnique({ where: { id: parsed.data.announcementId } });
      if (!bar) throw new BadRequestException({ code: "INVALID_TARGET", message: "That announcement bar no longer exists." });
      const out = variants.map((v) => (v.key === CONTROL_KEY ? { ...v, payload: undefined } : { ...v, payload: announcementVariantPayloadSchema.parse(v.payload) }));
      return { variants: out, target: parsed.data };
    }

    // offer
    const out = variants.map((v) => ({ ...v, payload: offerVariantPayloadSchema.parse(v.payload ?? { discountId: null }) }));
    const ids = out.map((v) => v.payload.discountId).filter((d): d is string => !!d);
    if (ids.length === 0) throw new BadRequestException({ code: "INVALID_VARIANTS", message: "At least one variant must use a discount." });
    if (new Set(ids).size !== ids.length) throw new BadRequestException({ code: "INVALID_VARIANTS", message: "Each variant needs a different discount." });
    const found = await this.prisma.discount.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException({ code: "INVALID_VARIANTS", message: "A chosen discount no longer exists." });
    return { variants: out, target: null };
  }

  private async findPublishedBlock(target: BlockTarget): Promise<BlockLike> {
    const page = await this.prisma.page.findUnique({ where: { id: target.pageId } });
    if (!page || page.deletedAt) throw new BadRequestException({ code: "INVALID_TARGET", message: "That page no longer exists." });
    const block = ((page.blocksPublished as BlockLike[] | null) ?? []).find((b) => b.id === target.blockId);
    if (!block) throw new BadRequestException({ code: "INVALID_TARGET", message: "That block isn't on the published page — publish the page first." });
    return block;
  }

  /** One running/paused test per block or bar, and a discount can belong to only one offer test. */
  private async assertNoConflict(experiment: Experiment): Promise<void> {
    const others = await this.prisma.experiment.findMany({ where: { id: { not: experiment.id }, kind: experiment.kind, status: { in: ["running", "paused"] } } });
    for (const other of others) {
      if (experiment.kind === "block") {
        const a = experiment.target as BlockTarget;
        const b = other.target as BlockTarget;
        if (a.pageId === b.pageId && a.blockId === b.blockId) throw new ConflictException({ code: "TARGET_BUSY", message: `"${other.name}" is already testing this block.` });
      } else if (experiment.kind === "announcement") {
        if ((experiment.target as AnnouncementTarget).announcementId === (other.target as AnnouncementTarget).announcementId) {
          throw new ConflictException({ code: "TARGET_BUSY", message: `"${other.name}" is already testing this announcement.` });
        }
      } else {
        const mine = new Set((experiment.variants as ExperimentVariant[]).map((v) => (v.payload as OfferVariantPayload | undefined)?.discountId).filter(Boolean));
        const shared = (other.variants as ExperimentVariant[]).some((v) => mine.has((v.payload as OfferVariantPayload | undefined)?.discountId));
        if (shared) throw new ConflictException({ code: "TARGET_BUSY", message: `"${other.name}" already uses one of these discounts.` });
      }
    }
  }

  private async applyWinner(experiment: Experiment, winner: ExperimentVariant, variants: ExperimentVariant[], actor: AuthenticatedStaff): Promise<string> {
    if (experiment.kind === "block") {
      if (winner.key === CONTROL_KEY) return "Control kept — nothing to change.";
      const target = experiment.target as BlockTarget;
      const page = await this.prisma.page.findUnique({ where: { id: target.pageId } });
      const draft = (page?.blocksDraft as BlockLike[] | null) ?? [];
      if (!page || !draft.some((b) => b.id === target.blockId)) return "The block is no longer in the page draft — nothing changed.";
      const props = (winner.payload as { props: unknown }).props;
      const next = draft.map((b) => (b.id === target.blockId ? { ...b, props } : b));
      await this.prisma.page.update({ where: { id: page.id }, data: { blocksDraft: next as unknown as Prisma.InputJsonValue } });
      await this.audit.record({ actorType: "staff", actorId: actor.id, action: "page.update", entityType: "page", entityId: page.id, before: { blockId: target.blockId }, after: { blockId: target.blockId, props, source: `experiment:${experiment.id}` } });
      return "The winning version was copied into the page draft — review and publish the page.";
    }

    if (experiment.kind === "announcement") {
      if (winner.key === CONTROL_KEY) return "Control kept — nothing to change.";
      const target = experiment.target as AnnouncementTarget;
      const payload = announcementVariantPayloadSchema.parse(winner.payload);
      const before = await this.prisma.announcementBar.findUnique({ where: { id: target.announcementId } });
      if (!before) return "The announcement bar no longer exists — nothing changed.";
      const after = await this.prisma.announcementBar.update({
        where: { id: target.announcementId },
        data: {
          message: payload.message as Prisma.InputJsonValue,
          ...(payload.linkText !== undefined ? { linkText: json(payload.linkText) } : {}),
          ...(payload.linkUrl !== undefined ? { linkUrl: payload.linkUrl } : {}),
        },
      });
      await this.audit.record({ actorType: "staff", actorId: actor.id, action: "announcement.update", entityType: "announcement_bar", entityId: after.id, before, after });
      return "The announcement bar now shows the winning text.";
    }

    // offer: keep the winner's discount, switch the others off so they don't suddenly apply to everyone.
    const losers = variants
      .filter((v) => v.key !== winner.key)
      .map((v) => (v.payload as OfferVariantPayload | undefined)?.discountId)
      .filter((d): d is string => !!d);
    for (const discountId of losers) {
      const before = await this.prisma.discount.findUnique({ where: { id: discountId } });
      if (!before || before.status === "disabled") continue;
      const after = await this.prisma.discount.update({ where: { id: discountId }, data: { status: "disabled" } });
      await this.audit.record({ actorType: "staff", actorId: actor.id, action: "discount.update", entityType: "discount", entityId: discountId, before, after });
    }
    return losers.length > 0 ? `Disabled ${losers.length} discount(s) from the other variants.` : "Nothing to change.";
  }

  /** Storefront caches: assignment cache now, page/announcement ISR via tag revalidation. */
  private async changed(experiment: Experiment): Promise<void> {
    this.assignments.invalidate();
    if (experiment.kind === "block") {
      const page = await this.prisma.page.findUnique({ where: { id: (experiment.target as BlockTarget).pageId }, select: { slug: true } });
      if (page) await this.revalidation.revalidate([`page:${page.slug}`, "pages"]);
    } else if (experiment.kind === "announcement") {
      await this.revalidation.revalidate(["announcements"]);
    }
  }
}
