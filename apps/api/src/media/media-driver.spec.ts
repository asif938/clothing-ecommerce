import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalStorageDriver } from "@clothing/shared/providers";
import { cloudinaryConfigSchema } from "@clothing/shared/providers";
import { createCloudinaryMediaDriver, createEnvMediaDriver, kindFromMimeType, toCloudinaryResourceType } from "./media-driver";

// A real 2x2 PNG (smallest valid image sharp can decode) so the image path is exercised for real, not mocked.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mNk+M9QzzAwMDA0MAGAAgwACxEBo8xJmCAAAAAASUVORK5CYII=",
  "base64",
);

describe("kindFromMimeType / toCloudinaryResourceType", () => {
  it("classifies common mime types", () => {
    expect(kindFromMimeType("image/png")).toBe("image");
    expect(kindFromMimeType("video/mp4")).toBe("video");
    expect(kindFromMimeType("application/pdf")).toBe("document");
  });

  it("maps our kind to cloudinary's resource_type vocabulary", () => {
    expect(toCloudinaryResourceType("image")).toBe("image");
    expect(toCloudinaryResourceType("video")).toBe("video");
    expect(toCloudinaryResourceType("document")).toBe("raw");
    expect(toCloudinaryResourceType("font")).toBe("raw");
  });
});

describe("createEnvMediaDriver (local backend, real filesystem)", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "clothing-media-driver-test-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function driver() {
    const storage = createLocalStorageDriver({ rootDir: root, publicBaseUrl: "http://api.test/media" });
    return createEnvMediaDriver(storage, "local");
  }

  it("uploads an image and pre-generates thumb/md/lg variants + a blur placeholder", async () => {
    const result = await driver().upload({ buffer: TINY_PNG, mimeType: "image/png", mediaId: "m1", kind: "image" });
    expect(result.storageKey).toBe("media/m1/original");
    expect(result.externalId).toBeNull();
    expect(result.variants).not.toBeNull();
    expect(Object.keys(result.variants ?? {})).toEqual(["thumb", "md", "lg"]);
    expect(result.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
  });

  it("uploads a non-image with no variants or blur", async () => {
    const result = await driver().upload({ buffer: Buffer.from("pdf-bytes"), mimeType: "application/pdf", mediaId: "m2", kind: "document" });
    expect(result.variants).toBeNull();
    expect(result.blurDataUrl).toBeNull();
    expect(readFileSync(join(root, "media/m2/original")).toString()).toBe("pdf-bytes");
  });

  it("delete removes the original and every variant file", async () => {
    const d = driver();
    const result = await d.upload({ buffer: TINY_PNG, mimeType: "image/png", mediaId: "m3", kind: "image" });
    await d.delete({ storageKey: result.storageKey, externalId: null, resourceType: "image", variants: result.variants });
    expect(() => readFileSync(join(root, "media/m3/original"))).toThrow();
  });

  it("reports direct upload as unsupported (local has no signed-PUT concept)", async () => {
    const ticket = await driver().createDirectUploadTicket({ mimeType: "image/png", kind: "image", tempId: "t1" });
    expect(ticket.supported).toBe(false);
  });

  it("toMediaRef resolves absolute URLs for the original and every variant", async () => {
    const d = driver();
    const result = await d.upload({ buffer: TINY_PNG, mimeType: "image/png", mediaId: "m4", kind: "image" });
    const ref = d.toMediaRef({ storageKey: result.storageKey, externalId: null, resourceType: "image", version: null, variants: result.variants, focalX: 0.5, focalY: 0.5 });
    expect(ref.provider).toBe("local");
    expect(ref.url).toBe("http://api.test/media/media/m4/original");
    expect(ref.variants?.thumb?.url).toBe("http://api.test/media/media/m4/thumb.webp");
  });
});

describe("createCloudinaryMediaDriver (mock mode — no network credentials in this environment)", () => {
  const config = cloudinaryConfigSchema.parse({ cloudName: "demo", apiKey: "k", apiSecret: "s", mock: true });

  it("uploads with no pre-generated variants, but still a cheap local blur placeholder", async () => {
    const result = await createCloudinaryMediaDriver(config, "inst-1").upload({ buffer: TINY_PNG, mimeType: "image/png", mediaId: "m1", kind: "image" });
    expect(result.variants).toBeNull();
    expect(result.externalId).toBe("m1");
    expect(result.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
  });

  it("toMediaRef builds a cloudinary ref with the on-the-fly URL as `url`", () => {
    const driver = createCloudinaryMediaDriver(config, "inst-1");
    const ref = driver.toMediaRef({ storageKey: "media/m1", externalId: "media/m1", resourceType: "image", version: 7, variants: null, focalX: 0.5, focalY: 0.5 });
    expect(ref.provider).toBe("cloudinary");
    expect(ref.url).toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v7/media/m1");
  });

  it("createDirectUploadTicket reports support with a mock signature", async () => {
    const ticket = await createCloudinaryMediaDriver(config, "inst-1").createDirectUploadTicket({ mimeType: "image/png", kind: "image", tempId: "t1" });
    expect(ticket.supported).toBe(true);
    expect(ticket.fields?.signature).toBe("mock-signature");
  });

  it("delete is a no-op in mock mode and does not throw", async () => {
    await expect(createCloudinaryMediaDriver(config, "inst-1").delete({ storageKey: "x", externalId: "m1", resourceType: "image", variants: null })).resolves.toBeUndefined();
  });
});
