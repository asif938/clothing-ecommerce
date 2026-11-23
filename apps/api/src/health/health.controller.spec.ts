import { Test } from "@nestjs/testing";
import { TerminusModule } from "@nestjs/terminus";
import { describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller";
import { PrismaService } from "../prisma/prisma.service";

// The first test pays for loading Nest + Terminus; under a full parallel suite run that alone can pass vitest's 5 s default.
const NEST_BOOT_TIMEOUT_MS = 30_000;

describe("HealthController", () => {
  it("reports up when the database is reachable", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: { $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]) } }],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const result = await controller.readiness();
    expect(result.status).toBe("ok");
    expect(result.details.database?.status).toBe("up");
  }, NEST_BOOT_TIMEOUT_MS);

  it("reports down when the database is unreachable", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: { $queryRaw: vi.fn().mockRejectedValue(new Error("refused")) } },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    await expect(controller.readiness()).rejects.toBeTruthy();
  }, NEST_BOOT_TIMEOUT_MS);

  it("liveness is always ok with no dependencies", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: {} }],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const result = await controller.liveness();
    expect(result.status).toBe("ok");
  }, NEST_BOOT_TIMEOUT_MS);
});
