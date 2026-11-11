import { describe, expect, it } from "vitest";
import { applyOrderFieldAccess, fieldAccessFor, maskPhone } from "./field-masking";

const DOT = "•";

describe("maskPhone", () => {
  it("keeps the first 5 and last 3 digits", () => {
    expect(maskPhone("01712345678")).toBe(`01712${DOT.repeat(3)}678`);
  });
  it("fully masks short values and passes null through", () => {
    expect(maskPhone("12345")).toBe(DOT.repeat(5));
    expect(maskPhone(null)).toBeNull();
  });
});

describe("fieldAccessFor", () => {
  it("grants everything when enforcement is off", () => {
    expect(fieldAccessFor({ permissions: new Set() }, false)).toEqual({ phone: true, cost: true });
  });
  it("follows the permissions when enforced", () => {
    expect(fieldAccessFor({ permissions: new Set(["fields.customer_phone.read"]) }, true)).toEqual({ phone: true, cost: false });
    expect(fieldAccessFor({ permissions: new Set(["catalog.cost.read"]) }, true)).toEqual({ phone: false, cost: true });
  });
});

describe("applyOrderFieldAccess", () => {
  const order = {
    billingContact: { name: "A", phone: "01712345678" },
    shippingAddress: { phone: "01812345678", line: "x" },
    customer: { phone: "01712345678" },
    items: [{ costPrice: 500 }],
  };
  it("masks phones and strips cost without mutating the input", () => {
    const out = applyOrderFieldAccess(order, { phone: false, cost: false });
    expect(out.billingContact.phone).toBe(`01712${DOT.repeat(3)}678`);
    expect(out.shippingAddress.phone).toBe(`01812${DOT.repeat(3)}678`);
    expect(out.customer.phone).toBe(`01712${DOT.repeat(3)}678`);
    expect((out.items as { costPrice: number | null }[])[0]!.costPrice).toBeNull();
    expect(order.billingContact.phone).toBe("01712345678");
    expect(order.items[0]!.costPrice).toBe(500);
  });
  it("returns the same object when full access", () => {
    expect(applyOrderFieldAccess(order, { phone: true, cost: true })).toBe(order);
  });
});
