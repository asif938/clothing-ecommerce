import { describe, expect, it } from "vitest";
import { SHARED_PACKAGE_VERSION } from "./index";

describe("@clothing/shared", () => {
  it("exposes a package version", () => {
    expect(SHARED_PACKAGE_VERSION).toBe("0.1.0");
  });
});
