import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { recommendSize, type SizeChartRow } from "@clothing/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { RecommendSizeDto, UpsertMeasurementsDto } from "./dto";

/**
 * Size recommender + customer measurements (docs/PROJECT_SPEC.md §16 M10).
 * The matching algorithm itself is pure/isomorphic
 * (`packages/shared/src/catalog/size-recommender.ts`) — this service's own
 * job is just resolving "which size chart does this product use" and
 * "whose measurements do we compare against" (an explicit override in the
 * request body, else the logged-in customer's saved profile).
 */
@Injectable()
export class SizeRecommenderService {
  constructor(private readonly prisma: PrismaService) {}

  async getMeasurements(customerId: string) {
    return await this.prisma.customerMeasurement.findUnique({ where: { customerId } });
  }

  async upsertMeasurements(customerId: string, dto: UpsertMeasurementsDto) {
    return await this.prisma.customerMeasurement.upsert({
      where: { customerId },
      create: { customerId, ...dto },
      update: dto,
    });
  }

  async recommendForProduct(slug: string, customerId: string | null, dto: RecommendSizeDto) {
    const product = await this.prisma.product.findUnique({ where: { slug }, select: { id: true, sizeChartId: true, sizeChart: true } });
    if (!product) throw new NotFoundException("Product not found");
    if (!product.sizeChart) throw new BadRequestException({ code: "NO_SIZE_CHART", message: "This product has no size chart to recommend from." });

    let measurements = dto.measurements ?? null;
    let fitPreference = dto.fitPreference;
    if (!measurements && customerId) {
      const saved = await this.getMeasurements(customerId);
      if (saved) {
        measurements = { heightCm: saved.heightCm ?? undefined, weightKg: saved.weightKg ?? undefined, chestCm: saved.chestCm ?? undefined, waistCm: saved.waistCm ?? undefined, hipCm: saved.hipCm ?? undefined, inseamCm: saved.inseamCm ?? undefined };
        fitPreference ??= saved.preferredFit as "snug" | "regular" | "loose";
      }
    }
    if (!measurements) throw new BadRequestException({ code: "MEASUREMENTS_REQUIRED", message: "Provide measurements or save a profile first." });

    const rows = product.sizeChart.rows as unknown as SizeChartRow[];
    const recommendation = recommendSize(rows, measurements, fitPreference ?? "regular");
    if (!recommendation) throw new BadRequestException({ code: "NO_MATCH", message: "We couldn't match your measurements to this chart's columns." });
    return recommendation;
  }
}
