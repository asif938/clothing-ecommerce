import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { archiveBaseName, extractImageArchive, ImageArchiveError, isImageUrl, listArchiveImageNames, matchesSku } from "./image-archive";

const bytes = (size: number) => new Uint8Array(size).fill(7);

describe("extractImageArchive", () => {
  it("keeps images by lower-cased base name, skipping non-images and OS junk", () => {
    const zip = zipSync({
      "Folder/PNJ-1.JPG": bytes(10),
      "b.png": bytes(5),
      "readme.txt": bytes(3),
      "__MACOSX/Folder/._PNJ-1.JPG": bytes(2),
      ".DS_Store": bytes(2),
    });
    const { images, skipped } = extractImageArchive(zip);
    expect(images.map((i) => i.name).sort()).toEqual(["b.png", "pnj-1.jpg"]);
    expect(skipped).toEqual([expect.objectContaining({ name: "readme.txt" })]);
  });

  it("neutralizes path-traversal names to their base name (nothing is written to disk anyway)", () => {
    const zip = zipSync({ "../../etc/evil.jpg": bytes(4) });
    expect(extractImageArchive(zip).images.map((i) => i.name)).toEqual(["evil.jpg"]);
  });

  it("skips duplicate base names from different folders", () => {
    const zip = zipSync({ "a/x.jpg": bytes(1), "b/x.jpg": bytes(1) });
    const { images, skipped } = extractImageArchive(zip);
    expect(images).toHaveLength(1);
    expect(skipped[0]!.reason).toMatch(/duplicate/);
  });

  it("skips a single oversized image and refuses an archive over the total limit before inflating", () => {
    const limits = { maxFiles: 10, maxFileBytes: 100, maxTotalBytes: 150 };
    const oneBig = zipSync({ "big.jpg": bytes(200), "ok.jpg": bytes(50) });
    const result = extractImageArchive(oneBig, limits);
    expect(result.images.map((i) => i.name)).toEqual(["ok.jpg"]);
    expect(result.skipped[0]!.name).toBe("big.jpg");

    const tooMuch = zipSync({ "a.jpg": bytes(90), "b.jpg": bytes(90) });
    expect(() => extractImageArchive(tooMuch, limits)).toThrow(ImageArchiveError);
  });

  it("refuses an archive with too many files and a non-ZIP buffer", () => {
    const many = zipSync(Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`${i}.jpg`, bytes(1)])));
    expect(() => extractImageArchive(many, { maxFiles: 3, maxFileBytes: 100, maxTotalBytes: 1000 })).toThrow(/more than 3 files/);
    expect(() => extractImageArchive(new Uint8Array([1, 2, 3]))).toThrow(/not a valid ZIP/);
  });
});

describe("listArchiveImageNames", () => {
  it("lists image names without inflating anything", () => {
    expect(listArchiveImageNames(zipSync({ "x/A.jpg": bytes(3), "n.txt": bytes(1) }))).toEqual(["a.jpg"]);
  });
});

describe("helpers", () => {
  it("archiveBaseName handles both separators", () => {
    expect(archiveBaseName("a\\b\\C.PNG")).toBe("c.png");
    expect(archiveBaseName("a/b/c.jpg")).toBe("c.jpg");
  });

  it("isImageUrl recognizes http(s) only", () => {
    expect(isImageUrl("https://cdn.example.com/a.jpg")).toBe(true);
    expect(isImageUrl("PNJ-1.jpg")).toBe(false);
  });

  it("matchesSku accepts exact, dash- and underscore-suffixed names, but not a longer SKU", () => {
    expect(matchesSku("pnj-1001-m.jpg", "PNJ-1001-M")).toBe(true);
    expect(matchesSku("pnj-1001-m-2.jpg", "PNJ-1001-M")).toBe(true);
    expect(matchesSku("pnj-1001-m_back.png", "PNJ-1001-M")).toBe(true);
    expect(matchesSku("pnj-1001-ml.jpg", "PNJ-1001-M")).toBe(false);
  });
});
