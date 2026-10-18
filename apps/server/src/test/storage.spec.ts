import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigError, readConfig } from "../env.js";
import { localDiskStorage, s3Storage, type AttachmentStorage, type S3Config } from "../storage.js";
import { createTeam, orgWithOwner } from "./org.js";
import { startTestServer } from "./server.js";

// RustFS speaks S3 and checks request signatures as S3 does. MinIO no
// longer publishes images.
let server: StartedTestContainer;
let s3: S3Config;

beforeAll(async () => {
  server = await new GenericContainer("rustfs/rustfs:1.0.0")
    .withEnvironment({ RUSTFS_ACCESS_KEY: "edict-test", RUSTFS_SECRET_KEY: "edict-test-secret" })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  s3 = {
    bucket: "edict-test",
    region: "us-east-1",
    endpoint: `http://${server.getHost()}:${server.getMappedPort(9000)}`,
    accessKeyId: "edict-test",
    secretAccessKey: "edict-test-secret",
  };
  await createBucket(s3);
});

afterAll(async () => {
  await server?.stop();
});

// A bucket for the tests, as a self-hoster would create one.
async function createBucket(config: S3Config) {
  const { AwsClient } = await import("aws4fetch");
  const client = new AwsClient({ ...config, service: "s3" });
  // The port can listen a moment before the server answers.
  for (let attempt = 0; ; attempt++) {
    const res = await client.fetch(`${config.endpoint}/${config.bucket}`, { method: "PUT" }).catch(() => undefined);
    if (res?.ok) return;
    if (attempt === 20) throw new Error(`could not create the test bucket: ${res?.status} ${await res?.text()}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

const key = () => `${randomUUID()}/${randomUUID()}`;

// The contract both drivers keep (ADR 0020).
function storageContract(name: string, make: () => Promise<AttachmentStorage>) {
  describe(`${name} storage`, () => {
    it("puts, gets and deletes bytes under a key", async () => {
      const storage = await make();
      const k = key();
      const bytes = new TextEncoder().encode("hello, edict");
      await storage.put(k, bytes);
      expect(await storage.get(k)).toEqual(bytes);
      await storage.delete(k);
      expect(await storage.get(k)).toBeUndefined();
    });

    it("answers a missing key with nothing, and deletes it without complaint", async () => {
      const storage = await make();
      const k = key();
      expect(await storage.get(k)).toBeUndefined();
      await expect(storage.delete(k)).resolves.toBeUndefined();
    });

    it("refuses keys that are not an organization and an id", async () => {
      const storage = await make();
      await expect(storage.put("../escape", new Uint8Array([1]))).rejects.toThrow(/storage key/);
      await expect(storage.get("a/b/c")).rejects.toThrow(/storage key/);
    });
  });
}

storageContract("local disk", async () => localDiskStorage(await mkdtemp(join(tmpdir(), "edict-storage-"))));
storageContract("S3", async () => s3Storage(s3));

describe("S3 storage", () => {
  it("fails its check with the bucket's name when the bucket is missing", async () => {
    await expect(s3Storage({ ...s3, bucket: "nowhere" }).check()).rejects.toThrow(/nowhere/);
    await expect(s3Storage({ ...s3, secretAccessKey: "wrong" }).check()).rejects.toThrow(/edict-test/);
    await expect(s3Storage(s3).check()).resolves.toBeUndefined();
  });

  it("serves attachments from the bucket, and the purge removes them there", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "edict-unused-"));
    const t = await startTestServer({ s3, dataDir });
    const { owner, org } = await orgWithOwner(t.baseUrl);
    const eng = await createTeam(owner, org, "ENG");
    await owner.post(`${org}/teams/${eng.id}/issues`, { title: "With a file" });
    const form = new FormData();
    form.append("file", new Blob(["in the bucket"], { type: "text/plain" }), "note.txt");
    const attachment = (await owner.postForm(`${org}/issues/ENG-1/attachments`, form)).body;
    const orgId = org.split("/").pop()!;

    const served = await fetch(`${t.baseUrl}${attachment.path}`, { headers: { cookie: owner.cookie } });
    expect(await served.text()).toBe("in the bucket");
    const bucket = s3Storage(s3);
    expect(new TextDecoder().decode(await bucket.get(`${orgId}/${attachment.id}`))).toBe("in the bucket");

    await owner.delete(`${org}/issues/ENG-1`);
    await t.purgeTrash(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));
    expect(await bucket.get(`${orgId}/${attachment.id}`)).toBeUndefined();
    await rm(dataDir, { recursive: true, force: true });
  });
});

describe("S3 configuration", () => {
  const base = { DATABASE_URL: "postgres://edict@localhost/edict" };

  it("stays on local disk without S3_BUCKET", () => {
    expect(readConfig(base).s3).toBeUndefined();
  });

  it("reads the bucket, credentials, region and endpoint", () => {
    const config = readConfig({
      ...base,
      S3_BUCKET: "files",
      S3_ACCESS_KEY_ID: "id",
      S3_SECRET_ACCESS_KEY: "secret",
      S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
    });
    expect(config.s3).toEqual({
      bucket: "files",
      region: "us-east-1",
      endpoint: "https://example.r2.cloudflarestorage.com",
      accessKeyId: "id",
      secretAccessKey: "secret",
    });
  });

  it("refuses a bucket without credentials, or an endpoint that is not a URL", () => {
    expect(() => readConfig({ ...base, S3_BUCKET: "files" })).toThrow(ConfigError);
    expect(() =>
      readConfig({ ...base, S3_BUCKET: "files", S3_ACCESS_KEY_ID: "id", S3_SECRET_ACCESS_KEY: "s", S3_ENDPOINT: "r2.example" }),
    ).toThrow(/S3_ENDPOINT/);
  });
});
