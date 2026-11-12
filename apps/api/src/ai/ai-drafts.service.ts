import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import sharp from "sharp";
import type { Prisma } from "@clothing/db";
import { AI_OUTPUT_SCHEMAS, type AiFeature, type AiOutput } from "@clothing/shared/ai";
import { t, type LocalizedText } from "@clothing/shared";
import type { AiImageInput } from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MediaProvidersService } from "../media/media-providers.service";
import type { MediaVariantMap } from "../media/media-driver";
import { ProductsService, PRODUCT_INCLUDE } from "../products/products.service";
import { ProductMediaService } from "../products/product-media.service";
import type { AuthenticatedStaff } from "../common/types";
import { AiService } from "./ai.service";
import type { GenerateProductDraftDto } from "./dto";

type ProductFull = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

const MAX_IMAGES = 3;
const MAX_ALT_BATCH = 6;
const IMAGE_EDGE_PX = 1024;
/** Product fields the translation feature moves between languages. */
const TRANSLATABLE = ["title", "subtitle", "shortDescription", "description", "seoTitle", "seoDescription", "careInstructions", "fabric"] as const;
type TranslatableField = (typeof TRANSLATABLE)[number];

function text(value: unknown, locale: "bn" | "en"): string {
  return t(value as LocalizedText | null, locale, locale) || "";
}

/**
 * AI content drafts for products (docs/PROJECT_SPEC.md §8.2 Catalog "AI
 * assistance (phase 2): generate description/SEO/alt text from images +
 * keywords, translate bn↔en; always a draft for review", §10.4, §16 M13).
 * Generating never touches the product: it stores an `ai_drafts` row staff
 * can edit, then apply (through the normal product services, so versioning,
 * audit and storefront revalidation happen exactly as for a manual edit) or
 * discard.
 */
@Injectable()
export class AiDraftsService {
  private readonly logger = new Logger(AiDraftsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ai: AiService,
    private readonly products: ProductsService,
    private readonly productMedia: ProductMediaService,
    private readonly mediaProviders: MediaProvidersService,
  ) {}

  /** Downscaled JPEG of a gallery image — vision models don't need the 15 MB original, and it keeps tokens (cost) down. */
  private async imageFor(media: ProductFull["media"][number]["media"]): Promise<AiImageInput | null> {
    if (media.kind !== "image") return null;
    try {
      const driver = await this.mediaProviders.resolveDriverForAsset(media);
      const original = await driver.downloadOriginal({ storageKey: media.storageKey, externalId: media.externalId, resourceType: media.resourceType, variants: media.variants as MediaVariantMap | null });
      const jpeg = await sharp(original).rotate().resize({ width: IMAGE_EDGE_PX, height: IMAGE_EDGE_PX, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
      return { mediaType: "image/jpeg", base64: jpeg.toString("base64") };
    } catch (error) {
      this.logger.warn(`Couldn't load media ${media.id} for AI: ${error instanceof Error ? error.message : "Unknown error"}`);
      return null;
    }
  }

  private productVariables(product: ProductFull, dto: GenerateProductDraftDto): Record<string, string> {
    const attributes = product.attributeValues
      .map((a) => `${text(a.attribute.name, "en")}: ${a.attributeValue ? text(a.attributeValue.value, "en") : (a.valueText ?? a.valueNumber ?? "")}`)
      .filter((s) => !s.endsWith(": "))
      .join("; ");
    const options = product.options.map((o) => `${text(o.name, "en")}: ${o.values.map((v) => text(v.value, "en")).join(", ")}`).join("; ");
    return {
      product_title: `${text(product.title, "en")}${text(product.title, "bn") ? ` / ${text(product.title, "bn")}` : ""}`,
      category: product.category ? text(product.category.name, "en") : "",
      attributes,
      options,
      fabric: text(product.fabric, "en") || text(product.fabric, "bn"),
      keywords: dto.keywords ?? "",
      description: text(product.description, "en") || text(product.description, "bn"),
      ...(dto.tone ? { tone: dto.tone } : {}),
    };
  }

  async generateForProduct(productId: string, dto: GenerateProductDraftDto, actor: AuthenticatedStaff) {
    const product = await this.products.get(productId);
    const base = this.productVariables(product, dto);
    const entity = { type: "product", id: productId };

    if (dto.feature === "alt_text") {
      const entries = dto.productMediaIds?.length
        ? product.media.filter((m) => dto.productMediaIds!.includes(m.id))
        : product.media.filter((m) => !text(m.alt, "bn") || !text(m.alt, "en")).slice(0, MAX_ALT_BATCH);
      if (entries.length === 0) throw new BadRequestException({ code: "NOTHING_TO_DESCRIBE", message: "Every image already has alt text — pick specific images to regenerate." });
      const drafts = [];
      for (const entry of entries.slice(0, MAX_ALT_BATCH)) {
        const image = await this.imageFor(entry.media);
        if (!image) continue;
        const optionValue = entry.optionValueId ? product.options.flatMap((o) => o.values).find((v) => v.id === entry.optionValueId) : null;
        const result = await this.ai.generate({ feature: "alt_text", variables: { ...base, option_value: optionValue ? text(optionValue.value, "en") : "" }, images: [image], actor, entity: { type: "product_media", id: entry.id } });
        drafts.push(await this.saveDraft("alt_text", "product_media", entry.id, { productId, productMediaId: entry.id }, result.output, result.usageLogId, actor));
      }
      return drafts;
    }

    if (dto.feature === "translation") {
      const direction = dto.direction ?? "bn_to_en";
      const [from, to] = direction === "bn_to_en" ? (["bn", "en"] as const) : (["en", "bn"] as const);
      const fields: Partial<Record<TranslatableField, string>> = {};
      for (const field of TRANSLATABLE) {
        const value = text(product[field], from);
        if (value) fields[field] = value;
      }
      if (Object.keys(fields).length === 0) throw new BadRequestException({ code: "NOTHING_TO_TRANSLATE", message: `This product has no ${from === "bn" ? "Bangla" : "English"} text to translate.` });
      const result = await this.ai.generate({
        feature: "translation",
        variables: { ...base, source_language: from === "bn" ? "Bangla" : "English", target_language: to === "bn" ? "Bangla" : "English", fields_json: JSON.stringify(fields) },
        actor,
        entity,
      });
      return [await this.saveDraft("translation", "product", productId, { direction, fields }, result.output, result.usageLogId, actor)];
    }

    const images: AiImageInput[] = [];
    if (dto.feature === "product_description") {
      for (const entry of product.media.slice(0, MAX_IMAGES)) {
        const image = await this.imageFor(entry.media);
        if (image) images.push(image);
      }
    }
    const result = await this.ai.generate({ feature: dto.feature, variables: base, images, actor, entity });
    return [await this.saveDraft(dto.feature, "product", productId, { keywords: dto.keywords ?? null, tone: dto.tone ?? null }, result.output, result.usageLogId, actor)];
  }

  private async saveDraft(feature: AiFeature, entityType: string, entityId: string, input: Record<string, unknown>, output: unknown, usageLogId: string, actor: AuthenticatedStaff) {
    const draft = await this.prisma.aiDraft.create({ data: { feature, entityType, entityId, input: input as Prisma.InputJsonValue, output: output as Prisma.InputJsonValue, usageLogId, createdBy: actor.id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "ai_draft.create", entityType, entityId, after: { draftId: draft.id, feature } });
    return draft;
  }

  /** Pending drafts for a product, including its gallery's alt-text drafts. */
  async listForProduct(productId: string) {
    const mediaIds = (await this.prisma.productMedia.findMany({ where: { productId }, select: { id: true } })).map((m) => m.id);
    return this.prisma.aiDraft.findMany({
      where: { status: "pending", OR: [{ entityType: "product", entityId: productId }, { entityType: "product_media", entityId: { in: mediaIds } }] },
      orderBy: { createdAt: "desc" },
    });
  }

  private async pending(id: string) {
    const draft = await this.prisma.aiDraft.findUnique({ where: { id } });
    if (!draft) throw new NotFoundException({ code: "DRAFT_NOT_FOUND", message: "Draft not found" });
    if (draft.status !== "pending") throw new BadRequestException({ code: "DRAFT_CLOSED", message: "This draft was already applied or discarded." });
    return draft;
  }

  /** Staff edits to the AI text before applying — validated against the same output contract. */
  async updateOutput(id: string, output: unknown) {
    const draft = await this.pending(id);
    const parsed = AI_OUTPUT_SCHEMAS[draft.feature as AiFeature].safeParse(output);
    if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_ERROR", message: parsed.error.message });
    return this.prisma.aiDraft.update({ where: { id }, data: { output: parsed.data as Prisma.InputJsonValue } });
  }

  async discard(id: string, actor: AuthenticatedStaff) {
    await this.pending(id);
    const draft = await this.prisma.aiDraft.update({ where: { id }, data: { status: "discarded", reviewedBy: actor.id, reviewedAt: new Date() } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "ai_draft.discard", entityType: draft.entityType, entityId: draft.entityId, after: { draftId: id } });
    return draft;
  }

  async apply(id: string, actor: AuthenticatedStaff) {
    const draft = await this.pending(id);
    const feature = draft.feature as AiFeature;
    const output = AI_OUTPUT_SCHEMAS[feature].parse(draft.output);

    if (feature === "alt_text") {
      const entry = await this.prisma.productMedia.findUnique({ where: { id: draft.entityId } });
      if (!entry) throw new NotFoundException({ code: "MEDIA_GONE", message: "That image was removed from the product." });
      await this.productMedia.update(entry.productId, entry.id, { alt: (output as AiOutput<"alt_text">).alt }, actor);
    } else {
      const product = await this.products.get(draft.entityId);
      const direction = (draft.input as { direction?: "bn_to_en" | "en_to_bn" } | null)?.direction ?? "bn_to_en";
      await this.products.update(draft.entityId, this.productPatch(feature, output, product, direction), actor);
    }

    const applied = await this.prisma.aiDraft.update({ where: { id }, data: { status: "applied", reviewedBy: actor.id, reviewedAt: new Date() } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "ai_draft.apply", entityType: draft.entityType, entityId: draft.entityId, after: { draftId: id, feature } });
    return applied;
  }

  /** Merges the draft into the product's localized fields (keeping whatever the draft doesn't cover). */
  productPatch(feature: AiFeature, output: unknown, product: Pick<ProductFull, TranslatableField>, direction: "bn_to_en" | "en_to_bn" = "bn_to_en"): Record<string, LocalizedText> {
    const merge = (current: unknown, next: Partial<LocalizedText>): LocalizedText => ({ ...((current as LocalizedText | null) ?? {}), ...next });
    if (feature === "product_description") {
      const o = output as AiOutput<"product_description">;
      return { description: merge(product.description, o.description), ...(o.shortDescription ? { shortDescription: merge(product.shortDescription, o.shortDescription) } : {}) };
    }
    if (feature === "seo_meta") {
      const o = output as AiOutput<"seo_meta">;
      return { seoTitle: merge(product.seoTitle, o.seoTitle), seoDescription: merge(product.seoDescription, o.seoDescription) };
    }
    if (feature === "translation") {
      const o = output as AiOutput<"translation">;
      // Only the target language is written; the source text stays as staff wrote it.
      const patch: Record<string, LocalizedText> = {};
      const target = direction === "bn_to_en" ? "en" : "bn";
      for (const field of TRANSLATABLE) {
        const value = o.fields[field];
        if (typeof value === "string" && value.trim()) patch[field] = merge(product[field], { [target]: value.trim() });
      }
      return patch;
    }
    throw new BadRequestException({ code: "UNSUPPORTED_FEATURE", message: "This draft type can't be applied to a product." });
  }

}
