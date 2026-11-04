import { describe, expect, it } from "vitest";
import { formatTakaFromPoisha, renderTemplate } from "./template-render.ts";

describe("renderTemplate", () => {
  it("substitutes every known variable", () => {
    expect(renderTemplate("Hi {customer_name}, order {order_number} is confirmed.", { customer_name: "Rahim", order_number: "ORD-1001" })).toBe(
      "Hi Rahim, order ORD-1001 is confirmed.",
    );
  });

  it("leaves an unknown placeholder untouched instead of blanking it", () => {
    expect(renderTemplate("Code: {otp}", {})).toBe("Code: {otp}");
  });

  it("leaves a placeholder untouched when its value is null or undefined", () => {
    expect(renderTemplate("Hi {customer_name}", { customer_name: null })).toBe("Hi {customer_name}");
    expect(renderTemplate("Hi {customer_name}", { customer_name: undefined })).toBe("Hi {customer_name}");
  });

  it("stringifies a numeric variable", () => {
    expect(renderTemplate("Total: {order_total}", { order_total: 1250 })).toBe("Total: 1250");
  });
});

describe("formatTakaFromPoisha", () => {
  it("formats a whole-taka amount with no decimals", () => {
    expect(formatTakaFromPoisha(125000)).toBe("৳1250");
  });

  it("formats a fractional-taka amount with two decimals", () => {
    expect(formatTakaFromPoisha(125050)).toBe("৳1250.50");
  });
});
