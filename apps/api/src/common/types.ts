/** Attached to the request by StaffAuthGuard once a session is validated. */
export interface AuthenticatedStaff {
  id: string;
  name: string;
  email: string;
  locale: string;
  permissions: Set<string>;
  /** True iff any of the staff's roles is a system role (only the seeded "Super Admin" role is) — see SuperAdminGuard. */
  isSuperAdmin: boolean;
  /** §12 "mandatory TOTP 2FA for all staff" — StaffAuthGuard locks non-exempt routes out until this is true. */
  totpEnabled: boolean;
}

/** Attached by CustomerContextGuard — `customer` only when a valid access-token cookie was presented; `anonymousId` is always set (read from or newly written to the anonymous_id cookie) so guest carts have a stable identity. */
export interface CustomerContext {
  customer: { id: string; phone: string | null } | null;
  anonymousId: string;
}

declare module "express-serve-static-core" {
  interface Request {
    staff?: AuthenticatedStaff;
    customerContext?: CustomerContext;
  }
}
