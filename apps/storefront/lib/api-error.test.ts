import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "./api-error";

describe("apiErrorMessage", () => {
  it("reads the API's own { code, message } body", () => {
    expect(apiErrorMessage({ code: "ADDRESS_REQUIRED", message: "Please add a delivery address." }, "fallback")).toBe("Please add a delivery address.");
  });

  it("still reads a wrapped { error: { message } } body", () => {
    expect(apiErrorMessage({ error: { code: "X", message: "Wrapped" } }, "fallback")).toBe("Wrapped");
  });

  it("takes the first entry of an array message", () => {
    expect(apiErrorMessage({ message: ["first", "second"] }, "fallback")).toBe("first");
  });

  it("falls back when there is no usable message", () => {
    expect(apiErrorMessage(null, "fallback")).toBe("fallback");
    expect(apiErrorMessage({ message: "" }, "fallback")).toBe("fallback");
    expect(apiErrorMessage("<html>gateway timeout</html>", "fallback")).toBe("fallback");
  });
});
