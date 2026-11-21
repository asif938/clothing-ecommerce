import { describe, expect, it, vi } from "vitest";
import { MockPayController } from "./mock-pay.controller";

function make() {
  const payments = { confirmByExternalRef: vi.fn(() => Promise.resolve()) };
  const config = { get: vi.fn(() => "https://shop.example.com") };
  const controller = new MockPayController(payments as never, config as never);
  const res = { redirect: vi.fn() };
  return { controller, payments, res };
}

describe("MockPayController", () => {
  it("redirects back to the storefront after settling", async () => {
    const { controller, payments, res } = make();
    await controller.pay("ref1", "success", "https://shop.example.com/checkout/success?orderId=o1", "https://shop.example.com/f", "https://shop.example.com/c", res as never);
    expect(payments.confirmByExternalRef).toHaveBeenCalledWith("mock", "ref1");
    expect(res.redirect).toHaveBeenCalledWith("https://shop.example.com/checkout/success?orderId=o1&ref=ref1");
  });

  it("refuses to redirect to another origin (open redirect)", async () => {
    const { controller, payments, res } = make();
    await expect(controller.pay("ref1", "success", "https://evil.example.net/phish", "", "", res as never)).rejects.toMatchObject({ response: { code: "INVALID_REDIRECT" } });
    expect(payments.confirmByExternalRef).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });
});
