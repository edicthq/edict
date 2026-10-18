// Where attachment bytes live (ADR 0020): a directory on local disk by
// default, or an S3-compatible bucket when S3_BUCKET is set. The routes and
// the data-access layer never know which.
import { constants } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AwsClient } from "aws4fetch";

export interface AttachmentStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  // Removing a key that holds nothing is not an error.
  delete(key: string): Promise<void>;
  // Run at startup: throws, saying what to fix, when storage can't be used.
  check(): Promise<void>;
}

// Only `${orgId}/${id}` keys are valid, so no key can reach outside the
// directory or the bucket's attachments.
function checkedKey(key: string): string[] {
  const parts = key.split("/");
  if (parts.length !== 2 || parts.some((part) => !/^[0-9a-f-]{6,}$/.test(part))) {
    throw new Error(`not a storage key: ${key}`);
  }
  return parts;
}

export function localDiskStorage(dir: string): AttachmentStorage {
  const pathOf = (key: string) => join(dir, ...checkedKey(key));
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
    check: async () => {
      try {
        await mkdir(dir, { recursive: true });
        await access(dir, constants.W_OK);
      } catch (error) {
        throw new Error(`Attachments can't be written to DATA_DIR (${dir}): ${(error as Error).message}`);
      }
    },
  };
}

export interface S3Config {
  bucket: string;
  region: string;
  // Set for S3-compatible services (R2, RustFS, Garage, MinIO), which take
  // the bucket in the path. Unset means AWS, with the bucket in the host name.
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function s3Storage(config: S3Config): AttachmentStorage {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: "s3",
    retries: 3,
  });
  const bucketUrl = config.endpoint
    ? `${config.endpoint.replace(/\/+$/, "")}/${config.bucket}`
    : `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
  const urlOf = (key: string) => `${bucketUrl}/${checkedKey(key).join("/")}`;

  const fail = async (action: string, res: Response): Promise<never> => {
    const detail = (await res.text()).match(/<Code>([^<]+)<\/Code>/)?.[1] ?? res.statusText;
    throw new Error(`S3 ${action} in bucket ${config.bucket} failed: ${res.status} ${detail}`);
  };

  return {
    put: async (key, bytes) => {
      const res = await client.fetch(urlOf(key), {
        method: "PUT",
        body: bytes,
        headers: { "content-type": "application/octet-stream" },
      });
      if (!res.ok) await fail(`put of ${key}`, res);
    },
    get: async (key) => {
      const res = await client.fetch(urlOf(key));
      if (res.status === 404) {
        await res.body?.cancel();
        return undefined;
      }
      if (!res.ok) await fail(`get of ${key}`, res);
      return new Uint8Array(await res.arrayBuffer());
    },
    delete: async (key) => {
      const res = await client.fetch(urlOf(key), { method: "DELETE" });
      if (!res.ok && res.status !== 404) await fail(`delete of ${key}`, res);
      await res.body?.cancel();
    },
    check: async () => {
      const res = await client.fetch(`${bucketUrl}/`, { method: "HEAD" }).catch((error: Error) => {
        throw new Error(`S3 bucket ${config.bucket} can't be reached: ${error.message}`);
      });
      if (!res.ok) {
        throw new Error(
          `S3 bucket ${config.bucket} answered ${res.status}. Check that it exists and that S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY can use it.`,
        );
      }
    },
  };
}
