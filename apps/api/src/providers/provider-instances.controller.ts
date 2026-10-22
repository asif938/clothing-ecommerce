import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { listDriverDefinitions, type ProviderCapability } from "@clothing/shared/providers";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuditService } from "../audit/audit.service";
import {
  createProviderInstanceSchema,
  updateProviderInstanceSchema,
  type CreateProviderInstanceDto,
  type UpdateProviderInstanceDto,
} from "./dto";
import { PrismaService } from "../prisma/prisma.service";
import { ProviderRegistryService } from "./provider-registry.service";

@ApiTags("providers")
@Controller("admin/providers")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("providers.manage")
export class ProviderInstancesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistryService,
    private readonly audit: AuditService,
  ) {}

  @Get("catalog")
  catalog(@Query("capability") capability?: ProviderCapability) {
    const drivers = capability ? listDriverDefinitions(capability) : [];
    return drivers.map((d) => ({ capability: d.capability, driver: d.driver, label: d.label, secretFields: d.secretFields }));
  }

  @Get()
  async list(@Query("capability") capability?: string) {
    const instances = await this.prisma.providerInstance.findMany({
      where: capability ? { capability } : undefined,
      orderBy: { createdAt: "asc" },
    });
    return instances.map((instance) => ({
      ...instance,
      config: this.registry.maskConfigForDisplay(
        instance.capability as ProviderCapability,
        instance.driver,
        this.registry.decryptConfig(instance.config),
      ),
    }));
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createProviderInstanceSchema)) body: CreateProviderInstanceDto, @Req() req: Request) {
    const validatedConfig = this.registry.validateConfig(body.capability, body.driver, body.config);
    const instance = await this.prisma.providerInstance.create({
      data: {
        capability: body.capability,
        driver: body.driver,
        name: body.name,
        enabled: body.enabled,
        mode: body.mode,
        isDefault: body.isDefault,
        priority: body.priority,
        config: this.registry.encryptConfig(validatedConfig) as object,
      },
    });
    await this.audit.record({
      actorType: "staff",
      actorId: req.staff!.id,
      action: "provider_instance.create",
      entityType: "provider_instance",
      entityId: instance.id,
      after: { capability: body.capability, driver: body.driver, name: body.name },
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    return instance;
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body(new ZodValidationPipe(updateProviderInstanceSchema)) body: UpdateProviderInstanceDto, @Req() req: Request) {
    const existing = await this.prisma.providerInstance.findUniqueOrThrow({ where: { id } });
    const validatedConfig = body.config
      ? this.registry.validateConfig(existing.capability as ProviderCapability, existing.driver, body.config)
      : undefined;

    const updated = await this.prisma.providerInstance.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.mode !== undefined ? { mode: body.mode } : {}),
        ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(validatedConfig ? { config: this.registry.encryptConfig(validatedConfig) as object } : {}),
      },
    });

    await this.audit.record({
      actorType: "staff",
      actorId: req.staff!.id,
      action: "provider_instance.update",
      entityType: "provider_instance",
      entityId: id,
      before: { name: existing.name, enabled: existing.enabled },
      after: { name: updated.name, enabled: updated.enabled },
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    return updated;
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: Request) {
    const existing = await this.prisma.providerInstance.findUniqueOrThrow({ where: { id } });
    await this.prisma.providerInstance.delete({ where: { id } });
    await this.audit.record({
      actorType: "staff",
      actorId: req.staff!.id,
      action: "provider_instance.delete",
      entityType: "provider_instance",
      entityId: id,
      before: { name: existing.name },
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
  }

  @Post(":id/test-connection")
  async testConnection(@Param("id") id: string, @Req() req: Request) {
    const result = await this.registry.testConnection(id);
    await this.audit.record({
      actorType: "staff",
      actorId: req.staff!.id,
      action: "provider_instance.test_connection",
      entityType: "provider_instance",
      entityId: id,
      after: { ok: result.ok, message: result.message },
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    return result;
  }
}
