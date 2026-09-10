import { afterEach, describe, expect, it } from "bun:test";
import {
  isAttachmentsConfigured,
  isStorageConfigured,
  storageConfig,
} from "@/lib/storage/config";

const S3_VARS = [
  "S3_ENDPOINT",
  "S3_PUBLIC_ENDPOINT",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET_AVATARS",
  "S3_BUCKET_ISSUES",
] as const;

function clearEnv() {
  for (const name of S3_VARS) delete process.env[name];
}

afterEach(clearEnv);

describe("storageConfig()", () => {
  it("is null without S3_ENDPOINT — no avatar upload without configuration", () => {
    clearEnv();
    expect(storageConfig()).toBeNull();
    expect(isStorageConfigured()).toBe(false);
  });

  it("is null as long as keys or bucket are missing", () => {
    process.env.S3_ENDPOINT = "http://localhost:9000";
    process.env.S3_ACCESS_KEY_ID = "id";
    // Secret and bucket are still missing.
    expect(storageConfig()).toBeNull();
  });

  it("reads endpoint, keys, and bucket from the environment — without S3_BUCKET_ISSUES, attachments stay disabled", () => {
    process.env.S3_ENDPOINT = "http://localhost:9000";
    process.env.S3_REGION = "eu-central-1";
    process.env.S3_ACCESS_KEY_ID = "rustfsadmin";
    process.env.S3_SECRET_ACCESS_KEY = "rustfsadmin";
    process.env.S3_BUCKET_AVATARS = "avatars";

    expect(storageConfig()).toEqual({
      endpoint: "http://localhost:9000",
      publicEndpoint: "http://localhost:9000",
      region: "eu-central-1",
      accessKeyId: "rustfsadmin",
      secretAccessKey: "rustfsadmin",
      bucketAvatars: "avatars",
      bucketIssues: null,
    });
    expect(isStorageConfigured()).toBe(true);
    expect(isAttachmentsConfigured()).toBe(false);
  });

  it("falls back publicEndpoint to endpoint without S3_PUBLIC_ENDPOINT", () => {
    process.env.S3_ENDPOINT = "http://rustfs:9000";
    process.env.S3_ACCESS_KEY_ID = "id";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.S3_BUCKET_AVATARS = "avatars";

    expect(storageConfig()?.publicEndpoint).toBe("http://rustfs:9000");
  });

  it("uses S3_PUBLIC_ENDPOINT for the browser-facing endpoint when set", () => {
    process.env.S3_ENDPOINT = "http://rustfs:9000";
    process.env.S3_PUBLIC_ENDPOINT = "http://localhost:9000";
    process.env.S3_ACCESS_KEY_ID = "id";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.S3_BUCKET_AVATARS = "avatars";

    expect(storageConfig()?.endpoint).toBe("http://rustfs:9000");
    expect(storageConfig()?.publicEndpoint).toBe("http://localhost:9000");
  });

  it("falls back to us-east-1 without S3_REGION", () => {
    process.env.S3_ENDPOINT = "http://localhost:9000";
    process.env.S3_ACCESS_KEY_ID = "id";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.S3_BUCKET_AVATARS = "avatars";

    const config = storageConfig();
    expect(config?.region).toBe("us-east-1");
  });

  it("reads S3_BUCKET_ISSUES independently of the avatar bucket", () => {
    process.env.S3_ENDPOINT = "http://localhost:9000";
    process.env.S3_ACCESS_KEY_ID = "id";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    process.env.S3_BUCKET_AVATARS = "avatars";
    process.env.S3_BUCKET_ISSUES = "issues";

    expect(storageConfig()?.bucketIssues).toBe("issues");
    expect(isAttachmentsConfigured()).toBe(true);
  });
});
