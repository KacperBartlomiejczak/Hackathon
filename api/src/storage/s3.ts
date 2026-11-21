import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Config } from "../config.js";

export const PRESIGN_TTL_SECONDS = 15 * 60;

export type Storage = {
  presignGet(key: string): Promise<string>;
};

export function createStorage(config: Config): Storage {
  // Signing uses the browser-reachable endpoint: the host is part of the signature.
  const client = new S3Client({
    endpoint: config.S3_PUBLIC_ENDPOINT ?? config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
  });
  return {
    presignGet: (key) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }), {
        expiresIn: PRESIGN_TTL_SECONDS,
      }),
  };
}
