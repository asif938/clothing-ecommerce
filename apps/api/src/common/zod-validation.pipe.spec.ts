import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { ZodValidationPipe } from "./zod-validation.pipe";

describe("ZodValidationPipe", () => {
  const schema = z.object({ email: z.string().email(), age: z.number().int().min(0) });
  const pipe = new ZodValidationPipe(schema);

  it("passes through and returns parsed data for a valid payload", () => {
    const result = pipe.transform({ email: "a@b.com", age: 20 });
    expect(result).toEqual({ email: "a@b.com", age: 20 });
  });

  it("throws BadRequestException with a VALIDATION_ERROR code for an invalid payload", () => {
    expect(() => pipe.transform({ email: "not-an-email", age: -1 })).toThrow(BadRequestException);
    try {
      pipe.transform({ email: "not-an-email", age: -1 });
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({ code: "VALIDATION_ERROR" });
    }
  });
});
