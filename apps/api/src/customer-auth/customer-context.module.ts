import { Module } from "@nestjs/common";
import { CustomerContextGuard } from "./customer-context.guard";
import { RequireCustomerAuthGuard } from "./require-customer-auth.guard";

/**
 * Just the two guards, with no other dependencies — split out from
 * `CustomerAuthModule` so feature modules that merely need to know "who's
 * asking" (cart, addresses) don't have to import the OTP/Google/session
 * machinery, which in turn would create a module cycle once
 * `CustomerAuthModule` itself needs `CartService` for cart-merge-on-login
 * (§6.13).
 */
@Module({
  providers: [CustomerContextGuard, RequireCustomerAuthGuard],
  exports: [CustomerContextGuard, RequireCustomerAuthGuard],
})
export class CustomerContextModule {}
