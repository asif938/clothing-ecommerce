import { describe, expect, it } from "vitest";
import { getMediaUrl, type MediaRef } from "./url.ts";

const localRef: MediaRef = {
  provider: "local",
  resourceType: "image",
  url: "http://api.test/media/original.jpg",
  variants: {
    thumb: { url: "http://api.test/media/thumb.webp", width: 200, height: 150 },
    md: { url: "http://api.test/media/md.webp", width: 800, height: 600 },
    lg: { url: "http://api.test/media/lg.webp", width: 1600, height: 1200 },
  },
};

const cloudinaryRef: MediaRef = {
  provider: "cloudinary",
  resourceType: "image",
  url: "https://res.cloudinary.com/demo/image/upload/v42/shop/shirt.jpg",
  variants: null,
  cloudName: "demo",
  publicId: "shop/shirt",
  version: 42,
  deliveryDomain: null,
  focalX: 0.3,
  focalY: 0.7,
};

describe("getMediaUrl", () => {
  it("returns the original URL when no width is requested (local/s3)", () => {
    expect(getMediaUrl(localRef)).toBe(localRef.url);
  });

  it("picks the nearest pre-generated variant at or above the requested width", () => {
    expect(getMediaUrl(localRef, { width: 100 })).toBe("http://api.test/media/thumb.webp");
    expect(getMediaUrl(localRef, { width: 500 })).toBe("http://api.test/media/md.webp");
    expect(getMediaUrl(localRef, { width: 801 })).toBe("http://api.test/media/lg.webp");
  });

  it("falls back to the largest variant when the request exceeds every size", () => {
    expect(getMediaUrl(localRef, { width: 4000 })).toBe("http://api.test/media/lg.webp");
  });

  it("falls back to the original URL for a non-cloudinary ref with no variants", () => {
    const ref: MediaRef = { ...localRef, variants: null };
    expect(getMediaUrl(ref, { width: 500 })).toBe(ref.url);
  });

  it("builds a cloudinary transformation URL with f_auto/q_auto by default", () => {
    expect(getMediaUrl(cloudinaryRef)).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v42/shop/shirt",
    );
  });

  it("adds width/height and a limit crop when a size is requested", () => {
    expect(getMediaUrl(cloudinaryRef, { width: 400 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_400/v42/shop/shirt",
    );
    expect(getMediaUrl(cloudinaryRef, { width: 400, height: 300 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_400,h_300/v42/shop/shirt",
    );
  });

  it("maps the focal point to cloudinary gravity only for a fill crop", () => {
    expect(getMediaUrl(cloudinaryRef, { width: 400, height: 300, crop: "fill" })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,w_400,h_300,g_xy_center,x_0.3,y_0.7,fl_region_relative/v42/shop/shirt",
    );
  });

  it("respects an explicit format override", () => {
    expect(getMediaUrl(cloudinaryRef, { format: "webp" })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_webp,q_auto/v42/shop/shirt",
    );
  });

  it("uses a custom delivery domain when configured", () => {
    const ref: MediaRef = { ...cloudinaryRef, deliveryDomain: "https://cdn.example.com/" };
    expect(getMediaUrl(ref)).toBe("https://cdn.example.com/image/upload/f_auto,q_auto/v42/shop/shirt");
  });

  it("omits the version segment when the asset has none", () => {
    const ref: MediaRef = { ...cloudinaryRef, version: null };
    expect(getMediaUrl(ref)).toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/shop/shirt");
  });

  it("maps a video resource type to the video delivery segment", () => {
    const ref: MediaRef = { ...cloudinaryRef, resourceType: "video" };
    expect(getMediaUrl(ref)).toBe("https://res.cloudinary.com/demo/video/upload/f_auto,q_auto/v42/shop/shirt");
  });
});
