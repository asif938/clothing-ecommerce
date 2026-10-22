/** Attached to the request by StaffAuthGuard once a session is validated. */
export interface AuthenticatedStaff {
  id: string;
  name: string;
  email: string;
  locale: string;
  permissions: Set<string>;
}

declare module "express-serve-static-core" {
  interface Request {
    staff?: AuthenticatedStaff;
  }
}
