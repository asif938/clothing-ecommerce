import { describe, expect, it } from "vitest";
import { assertSafeUpload, sniffImageMime } from "./media-sniff";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const GIF = Buffer.from("GIF89a and the rest of the file");
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML = Buffer.from("<!DOCTYPE html><html><body><script>alert(1)</script></body></html>");
const PDF = Buffer.from("%PDF-1.4 fake pdf bytes");

describe("sniffImageMime", () => {
  it("recognizes real JPEG/PNG/GIF/WebP magic bytes", () => {
    expect(sniffImageMime(JPEG)).toBe("image/jpeg");
    expect(sniffImageMime(PNG)).toBe("image/png");
    expect(sniffImageMime(GIF)).toBe("image/gif");
    expect(sniffImageMime(WEBP)).toBe("image/webp");
  });

  it("returns null for bytes that don't match any known image signature", () => {
    expect(sniffImageMime(PDF)).toBeNull();
    expect(sniffImageMime(SVG)).toBeNull();
  });
});

describe("assertSafeUpload", () => {
  it("accepts a real image whose claimed MIME type matches its bytes", () => {
    expect(assertSafeUpload(JPEG, "image/jpeg")).toBe("image/jpeg");
  });

  it("rejects an SVG regardless of its claimed MIME type", () => {
    expect(() => assertSafeUpload(SVG, "image/svg+xml")).toThrow(/SVG\/HTML\/XML/);
  });

  it("rejects an HTML file masquerading as an image (polyglot upload)", () => {
    expect(() => assertSafeUpload(HTML, "image/jpeg")).toThrow(/SVG\/HTML\/XML/);
  });

  it("rejects a non-image file claimed as an image", () => {
    expect(() => assertSafeUpload(PDF, "image/jpeg")).toThrow(/doesn't look like/);
  });

  it("passes a genuine non-image file through untouched (no image claim to sniff)", () => {
    expect(assertSafeUpload(PDF, "application/pdf")).toBeNull();
  });
});
