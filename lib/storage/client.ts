import "server-only";
import { AwsClient } from "aws4fetch";
import { type StorageConfig, storageConfig } from "@/lib/storage/config";

// The client doesn't hold a connection open (it only signs requests that
// run over `fetch`), but is still reused instead of being rebuilt on every
// call — analogous to `lib/mail/transport.ts`. If the configuration
// changes, a new client is created.
//
// `aws4fetch` instead of `@aws-sdk/client-s3`: the latter fails to load
// under Turbopack dev in this project (`next dev` breaks with "Cannot find
// module '@aws-sdk/client-s3-<hash>'" — reproduces even in an isolated
// route with no relation to avatars, disappears with `next dev
// --webpack`). `aws4fetch` is dependency-free, signs via the standard
// `fetch` API, and has no package layout that Turbopack's externals
// resolution trips over.
let cached: { config: StorageConfig; client: AwsClient } | null = null;

export function getClient(): AwsClient | null {
  const config = storageConfig();
  if (!config) {
    cached = null;
    return null;
  }

  if (cached && sameConfig(cached.config, config)) return cached.client;

  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: "s3",
  });
  cached = { config, client };
  return client;
}

function sameConfig(a: StorageConfig, b: StorageConfig): boolean {
  return (
    a.endpoint === b.endpoint &&
    a.publicEndpoint === b.publicEndpoint &&
    a.region === b.region &&
    a.accessKeyId === b.accessKeyId &&
    a.secretAccessKey === b.secretAccessKey &&
    a.bucketAvatars === b.bucketAvatars
  );
}
