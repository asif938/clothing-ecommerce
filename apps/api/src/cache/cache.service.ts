import { Injectable } from "@nestjs/common";

interface CacheEntry {
  value: unknown;
  expiresAt: number | null;
  tags: string[];
}

/**
 * In-memory cache (free-tier default, docs/PROJECT_SPEC.md §15.2: no
 * mandatory Redis). `REDIS_URL` is reserved in `.env.example` for a future
 * Redis-backed implementation of this same interface on VPS deployments —
 * not built in Milestone 1 since nothing yet needs cross-instance cache
 * sharing (see docs/DECISIONS.md). Single-process only.
 */
@Injectable()
export class CacheService {
  private readonly store = new Map<string, CacheEntry>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, options?: { ttlSeconds?: number; tags?: string[] }): void {
    this.store.set(key, {
      value,
      expiresAt: options?.ttlSeconds ? Date.now() + options.ttlSeconds * 1000 : null,
      tags: options?.tags ?? [],
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  invalidateTag(tag: string): void {
    for (const [key, entry] of this.store) {
      if (entry.tags.includes(tag)) this.store.delete(key);
    }
  }
}
