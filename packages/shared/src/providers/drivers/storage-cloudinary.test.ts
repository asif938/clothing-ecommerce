import { describe, expect, it } from "vitest";
import {
  cloudinaryConfigSchema,
  cloudinaryDestroy,
  cloudinaryDirectUploadTicket,
  cloudinaryStorageDriverDefinition,
  cloudinaryUpload,
  cloudinaryUsage,
  type CloudinaryConfig,
} from "./storage-cloudinary.ts";

const mockConfig: CloudinaryConfig = cloudinaryConfigSchema.parse({
  cloudName: "demo",
  apiKey: "key",
  apiSecret: "secret",
  mock: true,
});

describe("cloudinary driver (mock mode — no network credentials in this environment)", () => {
  it("uploads without making a network call and echoes back the public id", async () => {
    const result = await cloudinaryUpload(mockConfig, {
      buffer: Buffer.from("fake-image-bytes"),
      resourceType: "image",
      publicId: "media/abc",
      folder: "shop",
    });
    expect(result.publicId).toBe("media/abc");
    expect(result.resourceType).toBe("image");
    expect(result.bytes).toBe(Buffer.byteLength("fake-image-bytes"));
  });

  it("destroy resolves without throwing", async () => {
    await expect(cloudinaryDestroy(mockConfig, "media/abc", "image")).resolves.toBeUndefined();
  });

  it("usage returns a deterministic zero in mock mode", async () => {
    await expect(cloudinaryUsage(mockConfig)).resolves.toEqual({ usedPercent: 0, details: { mock: true } });
  });

  it("builds a direct-upload ticket with a mock signature", () => {
    const ticket = cloudinaryDirectUploadTicket(mockConfig, { publicId: "media/abc", folder: "shop", resourceType: "image" });
    expect(ticket.url).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    expect(ticket.fields.signature).toBe("mock-signature");
    expect(ticket.fields.public_id).toBe("media/abc");
  });

  it("testConnection succeeds in mock mode with no network access", async () => {
    const result = await cloudinaryStorageDriverDefinition.testConnection(mockConfig);
    expect(result.ok).toBe(true);
  });

  it("rejects a config missing required fields", () => {
    expect(() => cloudinaryConfigSchema.parse({ cloudName: "demo" })).toThrow();
  });

  it("marks apiSecret as the only secret field", () => {
    expect(cloudinaryStorageDriverDefinition.secretFields).toEqual(["apiSecret"]);
  });
});
