/** Attached to the request by StaffAuthGuard once a session is validated. */
export interface AuthenticatedStaff {
  id: string;
  name: string;
  email: string;
  locale: string;
  permissions: Set<string>;
  /** True iff any of the staff's roles is a system role (only the seeded "Super Admin" role is) — see SuperAdminGuard. */
  isSuperAdmin: boolean;
}

declare module "express-serve-static-core" {
  interface Request {
    staff?: AuthenticatedStaff;
  }
}
