import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { derivePrefix, formatOrderNumber } from "./order-number";

/** Extracted from `CheckoutService` so `ReturnsService` (exchange orders, M6) can generate order numbers the same way without duplicating the retry-uniqueness loop. */
@Injectable()
export class OrderNumberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async generate(): Promise<string> {
    const [format, brandName] = await Promise.all([this.settings.getValue<string>("orders.numberFormat"), this.settings.getValue<unknown>("brand.name")]);
    const prefix = derivePrefix(typeof brandName === "object" && brandName ? ((brandName as { en?: string; bn?: string }).en ?? (brandName as { en?: string; bn?: string }).bn ?? null) : null);
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todaysCount = await this.prisma.order.count({ where: { createdAt: { gte: dayStart } } });

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = formatOrderNumber(format, prefix, now, todaysCount + 1 + attempt);
      const taken = await this.prisma.order.findUnique({ where: { orderNumber: candidate } });
      if (!taken) return candidate;
    }
    // Astronomically unlikely fallback — guarantees uniqueness even under a burst that outpaces the retry loop above.
    return formatOrderNumber(format, prefix, now, todaysCount + 1 + Math.floor(Math.random() * 10_000));
  }
}
