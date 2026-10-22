import { Test } from "@nestjs/testing";
import { TerminusModule } from "@nestjs/terminus";
import { describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller";
import { PRISMA_CLIENT } from "./prisma-client.token";

describe("HealthController", () => {
  it("reports up when the database is reachable", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [{ provide: PRISMA_CLIENT, useValue: { $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]) } }],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const result = await controller.readiness();
    expect(result.status).toBe("ok");
    expect(result.details.database?.status).toBe("up");
  });

  it("reports down when the database is unreachable", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        { provide: PRISMA_CLIENT, useValue: { $queryRaw: vi.fn().mockRejectedValue(new Error("refused")) } },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    await expect(controller.readiness()).rejects.toBeTruthy();
  });

  it("liveness is always ok with no dependencies", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [{ provide: PRISMA_CLIENT, useValue: {} }],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const result = await controller.liveness();
    expect(result.status).toBe("ok");
  });
});
