import { z } from "zod";

/**
 * Infra-only env vars (docs/PROJECT_SPEC.md §4.1/§15.5) — everything else
 * configurable lives in the `settings` table or `provider_instances`, never
 * here. Validated once at bootstrap via `ConfigModule.forRoot({ validate })`.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  HOSTING_TIER: z.enum(["free", "vps"]).default("free"),
  WORKER_MODE: z.enum(["embedded", "separate"]).default("embedded"),

  DATABASE_URL: z.string().min(1),
  DATABASE_DIRECT_URL: z.string().min(1).optional(),

  STOREFRONT_URL: z.string().url(),
  ADMIN_URL: z.string().url(),
  API_URL: z.string().url(),

  APP_ENCRYPTION_KEY: z.string().min(1),
  REVALIDATE_SECRET: z.string().optional().default(""),
  CRON_SECRET: z.string().optional().default(""),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_ROOT: z.string().default("./.data/media"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),

  REDIS_URL: z.string().optional(),
  MEILI_URL: z.string().optional(),
  MEILI_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${result.error.message}`);
  }
  if (result.data.STORAGE_DRIVER === "s3") {
    const required = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL"] as const;
    const missing = required.filter((key) => !result.data[key]);
    if (missing.length > 0) {
      throw new Error(`STORAGE_DRIVER=s3 requires: ${missing.join(", ")}`);
    }
  }
  return result.data;
}
