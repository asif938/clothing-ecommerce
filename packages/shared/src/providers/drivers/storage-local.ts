import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { ProviderDriverDefinition, StorageDriver } from "../types.ts";

/**
 * Local-disk storage driver — the free-tier default (docs/PROJECT_SPEC.md
 * §15.2). Files live under `rootDir`; `publicUrl` is served by the API at
 * `GET /media/:key` (see apps/api MediaModule), fronted by `publicBaseUrl`
 * when files are served through the API's own public URL.
 */
export const localStorageConfigSchema = z.object({
  rootDir: z.string().min(1),
  publicBaseUrl: z.string().url(),
});
export type LocalStorageConfig = z.infer<typeof localStorageConfigSchema>;

export function createLocalStorageDriver(config: LocalStorageConfig): StorageDriver {
  const root = resolve(config.rootDir);
  const pathFor = (key: string) => join(root, key);

  return {
    async put(key, body, _contentType) {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    },
    async get(key) {
      return await readFile(pathFor(key));
    },
    async delete(key) {
      await rm(pathFor(key), { force: true });
    },
    async signedUrl(key, _expiresInSeconds) {
      // Local driver has no signed-URL concept; it's only ever used behind
      // the API's own auth, so the public URL is returned as-is.
      return this.publicUrl(key);
    },
    publicUrl(key) {
      return `${config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
    },
  };
}

export const localStorageDriverDefinition: ProviderDriverDefinition<LocalStorageConfig> = {
  capability: "storage",
  driver: "local",
  label: { bn: "লোকাল ডিস্ক", en: "Local disk" },
  configSchema: localStorageConfigSchema,
  secretFields: [],
  async testConnection(config) {
    try {
      const driver = createLocalStorageDriver(config);
      const probeKey = `.provider-test/${Date.now()}.txt`;
      await driver.put(probeKey, new TextEncoder().encode("ok"), "text/plain");
      await driver.get(probeKey);
      await driver.delete(probeKey);
      return { ok: true, message: "Wrote and read a test file successfully." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
};
