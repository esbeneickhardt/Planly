/**
 * Storage abstraction: uses S3 when AWS_S3_BUCKET is configured, falls back to local disk.
 * All callers use `storeFile(buffer, filename)` and `getFileBuffer(filename)`.
 * The public URL returned is always `/api/uploads/<filename>` — the serve handler reads from S3 or disk.
 */
import { createHash } from 'crypto';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { config } from '../config/env';

let s3Client: import('@aws-sdk/client-s3').S3Client | null = null;
const S3_BUCKET = process.env.AWS_S3_BUCKET ?? '';
const S3_PREFIX = process.env.AWS_S3_PREFIX ?? 'planly-uploads';

async function getS3() {
  if (!S3_BUCKET) return null;
  if (s3Client) return s3Client;
  const { S3Client } = await import('@aws-sdk/client-s3');
  s3Client = new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    ...(process.env.AWS_ENDPOINT_URL ? { endpoint: process.env.AWS_ENDPOINT_URL, forcePathStyle: true } : {}),
    ...(process.env.AWS_ACCESS_KEY_ID ? {
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    } : {}),
  });
  return s3Client;
}

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
};

export { ALLOWED_MIME_TYPES };

export function fileExtFromMime(mime: string): string | null {
  return ALLOWED_MIME_TYPES[mime] ?? null;
}

export function generateFilename(buffer: Buffer, ext: string): string {
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 24);
  return `${hash}.${ext}`;
}

export async function storeFile(buffer: Buffer, filename: string, mimeType: string): Promise<void> {
  const s3 = await getS3();
  if (s3) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: `${S3_PREFIX}/${filename}`,
      Body: buffer,
      ContentType: mimeType,
    }));
    return;
  }
  // Local fallback
  await mkdir(config.uploadsDir, { recursive: true });
  await writeFile(join(config.uploadsDir, filename), buffer);
}

export async function getFileBuffer(filename: string): Promise<Buffer> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '');
  const s3 = await getS3();
  if (s3) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const res = await s3.send(new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: `${S3_PREFIX}/${safe}`,
    }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  return readFile(join(config.uploadsDir, safe));
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf',
  txt: 'text/plain', md: 'text/plain',
};

export function mimeFromExt(ext: string): string {
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}
