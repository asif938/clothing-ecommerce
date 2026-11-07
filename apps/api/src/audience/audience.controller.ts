import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CustomerContextGuard } from "../customer-auth/customer-context.guard";
import { PrismaService } from "../prisma/prisma.service";
import { SegmentsService } from "../customers/segments.service";

/**
 * Backs audience-targeted blocks (docs/PROJECT_SPEC.md §16 M10) —
 * `AudienceGate` (apps/storefront) calls this once per page view to decide
 * whether to show/hide a block. Deliberately a small, cheap, cacheable-at-
 * the-edge-for-a-moment GET rather than something SSR reads directly: block
 * visibility depends on login state and live segment membership, neither
 * of which the storefront's page-level cache (§3, free-tier friendly) can
 * key on without personalizing every page — see docs/DECISIONS.md.
 */
@ApiTags("store")
@Controller("store/audience")
export class AudienceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: SegmentsService,
  ) {}

  @Get("me")
  @UseGuards(CustomerContextGuard)
  async me(@Req() req: Request) {
    const customer = req.customerContext?.customer ?? null;
    if (!customer) return { loggedIn: false, segmentIds: [] as string[] };

    const segments = await this.segments.list();
    const segmentIds: string[] = [];
    for (const segment of segments) {
      const match = await this.prisma.customer.findFirst({ where: { id: customer.id, ...this.segments.whereFor(segment) }, select: { id: true } });
      if (match) segmentIds.push(segment.id);
    }
    return { loggedIn: true, segmentIds };
  }
}
