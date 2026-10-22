import { SetMetadata } from "@nestjs/common";

export const PERMISSIONS_METADATA_KEY = "permissions";

/** Marks a route (or every route on a controller) as requiring these permissions (golden rule 7). */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_METADATA_KEY, permissions);
