import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { z } from "zod";

/**
 * Golden rule 6: server-side validation is authoritative, via the same zod
 * schemas the admin/storefront forms use client-side. Usage:
 * `@Body(new ZodValidationPipe(schema)) body: z.infer<typeof schema>`.
 */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Request body failed validation",
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
