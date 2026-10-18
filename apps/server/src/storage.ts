// Where attachment bytes live (ADR 0020). Local disk now; an S3-compatible
// driver will slot in behind this interface when a self-hoster configures
// storage, without the routes or the data-access layer caring.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface AttachmentStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  // Removing a key that holds nothing is not an error.
  delete(key: string): Promise<void>;
}

// Only `${orgId}/${id}` keys resolve, so no key can reach outside the
// directory.
export function localDiskStorage(dir: string): AttachmentStorage {
  const pathOf = (key: string) => {
    const parts = key.split("/");
    if (parts.length !== 2 || parts.some((part) => !/^[0-9a-f-]{6,}$/.test(part))) {
      throw new Error(`not a storage key: ${key}`);
    }
    return join(dir, ...parts);
  };
  return {
    put: async (key, bytes) => {
      await mkdir(dirname(pathOf(key)), { recursive: true });
      await writeFile(pathOf(key), bytes);
    },
    get: async (key) => {
      try {
        return new Uint8Array(await readFile(pathOf(key)));
      } catch (error) {
        if ((error as { code?: string }).code === "ENOENT") {
          return undefined;
        }
        throw error;
      }
    },
    delete: async (key) => {
      await rm(pathOf(key), { force: true });
    },
  };
}
