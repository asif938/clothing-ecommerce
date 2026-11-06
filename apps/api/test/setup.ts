import cookieParser from "cookie-parser";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * §14 "API integration | Vitest/Jest + Supertest + real Postgres (CI
 * service container)". Boots the real `AppModule` (same wiring `main.ts`
 * uses) against whatever `DATABASE_URL` is set to — a real Postgres,
 * migrated beforehand by the CI job (`pnpm db:migrate:deploy`), never a
 * mock. Not runnable in this sandbox (no live Postgres here — see
 * docs/PROGRESS.md's running "Not verified in this environment" note on
 * every prior milestone); it runs for real in CI's `integration-tests` job
 * (.github/workflows/ci.yml), which does have a Postgres service
 * container.
 */
export async function createTestApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.use(cookieParser());
  app.setGlobalPrefix("api/v1", { exclude: ["health", "ready", "media/*splat"] });
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma };
}

/**
 * Truncates every table except Prisma's own migration-history table, so
 * each integration spec file starts from an empty (but migrated) schema
 * without re-running migrations. `RESTART IDENTITY CASCADE` resets
 * sequences too, and cascades through FKs in one statement regardless of
 * dependency order.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const names = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}
