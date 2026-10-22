import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedStaff } from "./types";

/** Use after `@UseGuards(StaffAuthGuard)` — that guard is what populates `req.staff`. */
export const CurrentStaff = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedStaff => {
  const request = ctx.switchToHttp().getRequest<Request>();
  if (!request.staff) {
    throw new Error("CurrentStaff used without StaffAuthGuard on the route");
  }
  return request.staff;
});
