import { describe, expect, it } from "vitest";
import { buildConfig, humanizeKey, initialValues, type ConfigField } from "./provider-form";

const cloudinary: ConfigField[] = [
  { key: "cloudName", kind: "text", required: true, nullable: false },
  { key: "apiKey", kind: "text", required: true, nullable: false },
  { key: "apiSecret", kind: "secret", required: true, nullable: false },
  { key: "folderPrefix", kind: "text", required: false, nullable: false, defaultValue: "" },
  { key: "deliveryDomain", kind: "text", required: false, nullable: true, defaultValue: null, format: "url" },
  { key: "mock", kind: "boolean", required: false, nullable: false, defaultValue: false },
];

describe("provider form helpers", () => {
  it("starts a new instance from the driver defaults", () => {
    expect(initialValues(cloudinary)).toEqual({ cloudName: "", apiKey: "", apiSecret: "", folderPrefix: "", deliveryDomain: "", mock: false });
  });

  it("starts an edit from the stored config with secrets blank", () => {
    const values = initialValues(cloudinary, { cloudName: "shop", apiKey: "123", apiSecret: "••••abcd", folderPrefix: "a/", deliveryDomain: null, mock: true });
    expect(values).toMatchObject({ cloudName: "shop", apiSecret: "", deliveryDomain: "", mock: true });
  });

  it("builds a config and reports missing required fields", () => {
    const missing = buildConfig(cloudinary, initialValues(cloudinary), false);
    expect(missing.errors).toEqual({ cloudName: "required", apiKey: "required", apiSecret: "required" });

    const ok = buildConfig(cloudinary, { cloudName: " shop ", apiKey: "1", apiSecret: "s", folderPrefix: "", deliveryDomain: "", mock: false }, false);
    expect(ok.errors).toEqual({});
    expect(ok.config).toEqual({ cloudName: "shop", apiKey: "1", apiSecret: "s", deliveryDomain: null, mock: false });
  });

  it("leaves a blank secret out when editing so the stored one is kept", () => {
    const result = buildConfig(cloudinary, { cloudName: "shop", apiKey: "1", apiSecret: "", folderPrefix: "", deliveryDomain: "", mock: false }, true);
    expect(result.errors).toEqual({});
    expect("apiSecret" in result.config).toBe(false);
  });

  it("checks urls, numbers, selects and json", () => {
    const fields: ConfigField[] = [
      { key: "deliveryDomain", kind: "text", required: false, nullable: true, format: "url" },
      { key: "port", kind: "number", required: true, nullable: false, integer: true, min: 1, max: 65535 },
      { key: "method", kind: "select", required: false, nullable: false, options: ["GET", "POST"] },
      { key: "params", kind: "json", required: false, nullable: false },
    ];
    expect(buildConfig(fields, { deliveryDomain: "nope", port: "1.5", method: "PUT", params: "{bad" }, false).errors).toEqual({
      deliveryDomain: "url",
      port: "integer",
      method: "option",
      params: "json",
    });
    expect(buildConfig(fields, { deliveryDomain: "https://img.shop.com", port: "587", method: "POST", params: '{"to":"{to}"}' }, false).config).toEqual({
      deliveryDomain: "https://img.shop.com",
      port: 587,
      method: "POST",
      params: { to: "{to}" },
    });
  });

  it("humanizes config keys", () => {
    expect(humanizeKey("cloudName")).toBe("Cloud name");
    expect(humanizeKey("apiKey")).toBe("API key");
    expect(humanizeKey("merchantPrivateKeyPem")).toBe("Merchant private key PEM");
    expect(humanizeKey("delayMs")).toBe("Delay MS");
  });
});
