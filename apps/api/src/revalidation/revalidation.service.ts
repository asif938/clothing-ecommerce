import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.schema";

/**
 * Publishing pipeline (docs/PROJECT_SPEC.md §9.6): on publish/update of
 * content, settings, theme, menus etc., call the storefront's
 * `POST /api/revalidate` with the shared secret and the affected cache
 * tags, so the change is visible there within seconds — the mechanism
 * behind the M3 acceptance scenario ("storefront reflects [a change]
 * within 10s without a deploy"). Never throws: a revalidation hiccup must
 * not fail the admin mutation that triggered it — the storefront's own
 * `revalidate: 60` fallback (see `@clothing/blocks`'s `store-api.ts`, and
 * the page/config fetches) still catches up within a minute either way.
 */
@Injectable()
export class RevalidationService {
  private readonly logger = new Logger(RevalidationService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async revalidate(tags: string[]): Promise<void> {
    if (tags.length === 0) return;
    const secret = this.config.get("REVALIDATE_SECRET", { infer: true });
    if (!secret) {
      this.logger.warn(`Skipping revalidation of [${tags.join(", ")}] — REVALIDATE_SECRET is not configured`);
      return;
    }
    const storefrontUrl = this.config.get("STOREFRONT_URL", { infer: true });
    try {
      const response = await fetch(`${storefrontUrl}/api/revalidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-revalidate-secret": secret },
        body: JSON.stringify({ tags }),
      });
      if (!response.ok) {
        this.logger.warn(`Revalidation request for [${tags.join(", ")}] returned ${response.status}`);
      }
    } catch (error) {
      this.logger.warn(`Revalidation request for [${tags.join(", ")}] failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}
