import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { API_SCOPES, API_SCOPE_KEYS } from "@clothing/shared/analytics";
import { OrderStatusSchema } from "./order-status";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ApiKeyGuard, RequireScopes } from "./api-key.guard";
import { ApiKeysService } from "./api-keys.service";
import { PublicApiService } from "./public-api.service";

const createKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(API_SCOPE_KEYS)).min(1),
  expiresAt: z.coerce.date().nullable().optional(),
});

/** Staff screens for API keys (§16 M17). */
@ApiTags("api-keys")
@Controller("admin/api-keys")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("api_keys.manage")
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get("scopes")
  scopes() {
    return API_SCOPES;
  }

  @Get()
  list() {
    return this.keys.list();
  }

  /** The response is the only time the plaintext key is ever shown. */
  @Post()
  create(@Body(new ZodValidationPipe(createKeySchema)) body: z.infer<typeof createKeySchema>, @Req() req: Request) {
    return this.keys.create(body, req.staff!);
  }

  @Delete(":id")
  @HttpCode(200)
  revoke(@Param("id") id: string, @Req() req: Request) {
    return this.keys.revoke(id, req.staff!);
  }
}

const pageQuery = {
  limit: z.coerce.number().int().min(1).max(100).default(50),
  after: z.string().min(1).max(60).optional(),
};
const productsQuerySchema = z.object({ ...pageQuery, updatedSince: z.coerce.date().optional() });
const inventoryQuerySchema = z.object({ ...pageQuery, sku: z.string().trim().min(1).max(100).optional() });
const ordersQuerySchema = z.object({ ...pageQuery, placedSince: z.coerce.date().optional(), status: OrderStatusSchema.optional() });

/**
 * The public, read-only API (docs/PROJECT_SPEC.md §11.1, §16 M17), served at
 * `/api/v1/public/v1/*`. Authenticated by API key, not by a staff session.
 */
@ApiTags("public-api")
@Controller("public/v1")
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(private readonly api: PublicApiService) {}

  @Get("products")
  @RequireScopes("products.read")
  products(@Query(new ZodValidationPipe(productsQuerySchema)) query: z.infer<typeof productsQuerySchema>) {
    return this.api.products(query);
  }

  @Get("products/:idOrSlug")
  @RequireScopes("products.read")
  product(@Param("idOrSlug") idOrSlug: string) {
    return this.api.product(idOrSlug);
  }

  @Get("inventory")
  @RequireScopes("inventory.read")
  inventory(@Query(new ZodValidationPipe(inventoryQuerySchema)) query: z.infer<typeof inventoryQuerySchema>) {
    return this.api.inventory(query);
  }

  @Get("orders")
  @RequireScopes("orders.read")
  orders(@Query(new ZodValidationPipe(ordersQuerySchema)) query: z.infer<typeof ordersQuerySchema>) {
    return this.api.orders(query);
  }

  @Get("orders/:orderNumber")
  @RequireScopes("orders.read")
  order(@Param("orderNumber") orderNumber: string) {
    return this.api.order(orderNumber);
  }
}
