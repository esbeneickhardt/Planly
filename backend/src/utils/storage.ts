/**
 * Storage abstraction: uses S3-compatible object storage when S3_BUCKET is configured, falls back to local disk.
 * All callers use `storeFile(buffer, filename)` and `getFileBuffer(filename)`.
 * The public URL returned is always `/api/uploads/<filename>` - the serve handler reads from S3 or disk.
 */
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { config } from '../config/env';

// S3 client is lazily initialised and cached on first use
let s3Client: import('@aws-sdk/client-s3').S3Client | null = null;
const S3_BUCKET = process.env.S3_BUCKET ?? '';
const S3_PREFIX = process.env.S3_PREFIX ?? 'planly-uploads';

// Returns a cached S3 client, or null when S3 is not configured (local fallback mode)
async function getS3() {
  if (!S3_BUCKET) return null;
  if (s3Client) return s3Client;
  const { S3Client } = await import('@aws-sdk/client-s3');
  s3Client = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    // S3_ENDPOINT enables S3-compatible stores (e.g. MinIO, Scaleway, Cloudflare R2)
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
    ...(process.env.S3_ACCESS_KEY_ID
      ? {
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID!,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
          },
        }
      : {}),
  });
  return s3Client;
}

// Allowlist of accepted MIME types and their canonical file extensions
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
};

export { ALLOWED_MIME_TYPES };

// MIME types where magic-bytes verification is skipped (text has no signature)
const TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv', 'application/json']);

/**
 * Verifies the declared MIME type against the actual file content via magic bytes.
 * Returns true when the content matches or the type has no binary signature (text).
 * Returns false when the bytes contradict the declared type (e.g. HTML disguised as PNG).
 */
export function verifyMimeBytes(buf: Buffer, declaredMime: string): boolean {
  if (TEXT_MIME_TYPES.has(declaredMime)) return true;
  if (buf.length < 4) return false;
  const b = buf;

  if (declaredMime === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (declaredMime === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (declaredMime === 'image/gif') return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
  if (declaredMime === 'image/webp')
    return (
      buf.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50
    );
  if (declaredMime === 'application/pdf') return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  // ZIP-based formats (docx, xlsx, pptx, zip)
  const isZipFamily = [
    'application/zip',
    'application/x-zip-compressed',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ].includes(declaredMime);
  if (isZipFamily) return b[0] === 0x50 && b[1] === 0x4b;
  // Legacy Office formats
  if (declaredMime === 'application/msword' || declaredMime === 'application/vnd.ms-excel') {
    return b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
  }
  return false;
}

export function fileExtFromMime(mime: string): string | null {
  return ALLOWED_MIME_TYPES[mime] ?? null;
}

// Timestamp + sanitised original name — human-readable and sortable on disk
export function generateFilename(originalName: string, ext: string): string {
  const now = new Date();
  const ts =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    '-' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0') +
    '-' +
    String(now.getMilliseconds()).padStart(3, '0');
  const base = originalName
    .replace(/\.[^.]+$/, '')        // strip extension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')   // collapse non-alphanumeric runs to hyphens
    .replace(/^-+|-+$/g, '')        // trim leading/trailing hyphens
    .slice(0, 60) || 'file';
  return `${ts}_${base}.${ext}`;
}

const THUMBNAIL_MAX_DIMENSION = 480;
const THUMBNAIL_JPEG_QUALITY = 80;

// Derives a thumbnail's filename from the original - always .jpg since thumbnails are re-encoded
// to JPEG regardless of the original format, keeping decoding simple and universally supported.
export function thumbnailFilename(filename: string): string {
  return `${filename.replace(/\.[^.]+$/, '')}-thumb.jpg`;
}

/**
 * Generates a downscaled JPEG thumbnail for an image buffer - generic enough to reuse for any
 * future image upload (e.g. profile pictures), not just chat attachments.
 * Returns null for non-image MIME types or if the image can't be processed (e.g. corrupt file);
 * callers should fall back to serving the original in that case.
 */
export async function generateThumbnail(buf: Buffer, mimeType: string): Promise<Buffer | null> {
  if (!mimeType.startsWith('image/')) return null;
  try {
    return await sharp(buf)
      .rotate() // auto-orient from EXIF before resizing; sharp then strips metadata by default
      .resize({
        width: THUMBNAIL_MAX_DIMENSION,
        height: THUMBNAIL_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: THUMBNAIL_JPEG_QUALITY })
      .toBuffer();
  } catch {
    return null;
  }
}

// File storage operations (S3 or local disk)

export async function storeFile(buffer: Buffer, filename: string, mimeType: string): Promise<void> {
  const s3 = await getS3();
  if (s3) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: `${S3_PREFIX}/${filename}`,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
    return;
  }
  // Local disk fallback - ensure directory exists before writing
  await mkdir(config.uploadsDir, { recursive: true });
  await writeFile(join(config.uploadsDir, filename), buffer);
}

export async function deleteFile(filename: string): Promise<void> {
  // Sanitize filename to prevent path traversal before using it in a file operation
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '').replace(/\.{2,}/g, '');
  const s3 = await getS3();
  if (s3) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: `${S3_PREFIX}/${safe}` }));
    return;
  }
  await unlink(join(config.uploadsDir, safe));
}

export async function getFileBuffer(filename: string): Promise<Buffer> {
  // Sanitize filename to prevent path traversal before reading
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '').replace(/\.{2,}/g, '');
  const s3 = await getS3();
  if (s3) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const res = await s3.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: `${S3_PREFIX}/${safe}`,
      }),
    );
    // Stream the S3 response body into a Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  return readFile(join(config.uploadsDir, safe));
}

// Reverse map for serving files: derive Content-Type from stored extension
const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
};

export function mimeFromExt(ext: string): string {
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}
