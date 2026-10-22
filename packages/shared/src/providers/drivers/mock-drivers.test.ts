import { describe, expect, it, vi } from "vitest";
import { createMockEmailDriver, mockEmailDriverDefinition } from "./email-mock";
import { createMockSmsDriver, mockSmsDriverDefinition } from "./sms-mock";

describe("mock email driver", () => {
  it("calls onSend and resolves when simulating success", async () => {
    const onSend = vi.fn();
    const driver = createMockEmailDriver({ simulate: "success", delayMs: 0 }, onSend);
    await driver.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" });
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("throws when simulating failure", async () => {
    const driver = createMockEmailDriver({ simulate: "failure", delayMs: 0 });
    await expect(driver.send({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>" })).rejects.toThrow();
  });

  it("testConnection reflects the configured simulation", async () => {
    expect((await mockEmailDriverDefinition.testConnection({ simulate: "success", delayMs: 0 })).ok).toBe(true);
    expect((await mockEmailDriverDefinition.testConnection({ simulate: "failure", delayMs: 0 })).ok).toBe(false);
  });
});

describe("mock SMS driver", () => {
  it("calls onSend with the recipient and text", async () => {
    const onSend = vi.fn();
    const driver = createMockSmsDriver({ simulate: "success", delayMs: 0 }, onSend);
    await driver.send("01700000000", "Your order is confirmed");
    expect(onSend).toHaveBeenCalledWith("01700000000", "Your order is confirmed");
  });

  it("testConnection reflects the configured simulation", async () => {
    expect((await mockSmsDriverDefinition.testConnection({ simulate: "success", delayMs: 0 })).ok).toBe(true);
    expect((await mockSmsDriverDefinition.testConnection({ simulate: "failure", delayMs: 0 })).ok).toBe(false);
  });
});
