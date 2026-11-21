import { createHash } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../config.js';

/** documents.url_hash: sha256 hex of the URL. */
export function urlHash(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

const day = (date: Date): string => date.toISOString().slice(0, 10);

export function htmlKey(hash: string, date: Date): string {
  return `raw/${day(date)}/${hash}.html`;
}

export function screenshotKey(hash: string, date: Date): string {
  return `shots/${day(date)}/${hash}.png`;
}

export type Storage = {
  putHtml(key: string, html: string): Promise<string>;
  putScreenshot(key: string, png: Buffer): Promise<string>;
};

export function createStorage(cfg: typeof config = config): Storage {
  const client = new S3Client({
    endpoint: cfg.S3_ENDPOINT,
    region: cfg.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.S3_ACCESS_KEY, secretAccessKey: cfg.S3_SECRET_KEY },
  });
  const put = async (key: string, body: string | Buffer, contentType: string): Promise<string> => {
    await client.send(
      new PutObjectCommand({ Bucket: cfg.S3_BUCKET, Key: key, Body: body, ContentType: contentType }),
    );
    return key;
  };
  return {
    putHtml: (key, html) => put(key, html, 'text/html; charset=utf-8'),
    putScreenshot: (key, png) => put(key, png, 'image/png'),
  };
}
