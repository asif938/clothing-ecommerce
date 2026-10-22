import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalStorageDriver, localStorageDriverDefinition } from "./storage-local";

describe("local storage driver", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "clothing-storage-test-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes, reads, and deletes a file", async () => {
    const driver = createLocalStorageDriver({ rootDir: root, publicBaseUrl: "http://localhost:4000/media" });
    await driver.put("folder/file.txt", new TextEncoder().encode("hello"), "text/plain");
    expect(new TextDecoder().decode(await driver.get("folder/file.txt"))).toBe("hello");
    await driver.delete("folder/file.txt");
    await expect(driver.get("folder/file.txt")).rejects.toThrow();
  });

  it("builds a public URL from the configured base", () => {
    const driver = createLocalStorageDriver({ rootDir: root, publicBaseUrl: "http://localhost:4000/media/" });
    expect(driver.publicUrl("a/b.jpg")).toBe("http://localhost:4000/media/a/b.jpg");
  });

  it("testConnection succeeds against a writable directory", async () => {
    const result = await localStorageDriverDefinition.testConnection({
      rootDir: root,
      publicBaseUrl: "http://localhost:4000/media",
    });
    expect(result.ok).toBe(true);
  });
});
