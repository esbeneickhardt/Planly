/**
 * Integration tests for the file upload endpoints:
 *   POST   /api/upload
 *   GET    /api/uploads/:filename
 *   DELETE /api/uploads/:filename
 *
 * The storage layer (storeFile / getFileBuffer / deleteFile) is mocked so tests
 * exercise HTTP routing, auth, MIME validation, and ownership checks without
 * hitting the disk or S3.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../helpers/app';
import { prisma, createTestUser, randomSuffix } from '../helpers/db';
import { loginAs, cookieJar, bearerHeaders } from '../helpers/auth';
import { createTestApiToken } from '../helpers/db';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

// ── Storage mock ────────────────────────────────────────────────────────────

const mockStoreFile = vi.fn().mockResolvedValue(undefined);
const mockGetFileBuffer = vi.fn().mockResolvedValue(Buffer.from('file-bytes'));
const mockDeleteFile = vi.fn().mockResolvedValue(undefined);

vi.mock('../../utils/storage', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../utils/storage')>();
  return {
    ...real,
    storeFile: (...args: Parameters<typeof real.storeFile>) => mockStoreFile(...args),
    getFileBuffer: (...args: Parameters<typeof real.getFileBuffer>) => mockGetFileBuffer(...args),
    deleteFile: (...args: Parameters<typeof real.deleteFile>) => mockDeleteFile(...args),
  };
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Minimal PNG magic bytes - enough for verifyMimeBytes. */
function pngBytes() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

/** Builds a minimal multipart/form-data body for a single file field. */
function multipart(content: Buffer, filename: string, mime: string) {
  const boundary = 'PlanlyTestBoundary';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${mime}\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

// ── Suite ───────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_DB)('File upload endpoints', () => {
  let app: FastifyInstance;
  const suffix = randomSuffix();
  const uploaderEmail = `uploader_${suffix}@example.com`;
  const otherEmail = `other_up_${suffix}@example.com`;

  let uploaderId: string;
  let uploaderToken: string;
  let otherToken: string;
  let uploaderPat: string;

  beforeAll(async () => {
    app = await buildTestApp();

    const uploader = await createTestUser({
      email: uploaderEmail,
      username: `uploader_${suffix}`,
      password: 'pass1234',
    });
    await createTestUser({ email: otherEmail, username: `other_up_${suffix}`, password: 'pass1234' });
    uploaderId = uploader.id;

    uploaderToken = await loginAs(app, uploaderEmail, 'pass1234');
    otherToken = await loginAs(app, otherEmail, 'pass1234');

    const { raw } = await createTestApiToken(uploader.id, { name: 'upload-test-pat' });
    uploaderPat = raw;
  });

  afterAll(async () => {
    await prisma.fileUpload.deleteMany({ where: { uploaderId } });
    await prisma.user.deleteMany({ where: { email: { in: [uploaderEmail, otherEmail] } } });
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    mockStoreFile.mockClear();
    mockGetFileBuffer.mockClear();
    mockDeleteFile.mockClear();
  });

  // ── POST /api/upload ───────────────────────────────────────────────────────

  describe('POST /api/upload', () => {
    it('returns 401 when unauthenticated', async () => {
      const { body, contentType } = multipart(pngBytes(), 'photo.png', 'image/png');
      const res = await app.inject({
        method: 'POST',
        url: '/api/upload',
        headers: { 'content-type': contentType },
        payload: body,
      });
      expect(res.statusCode).toBe(401);
    });

    it('stores file and returns url, name, type on success', async () => {
      const { body, contentType } = multipart(pngBytes(), 'photo.png', 'image/png');
      const res = await app.inject({
        method: 'POST',
        url: '/api/upload',
        headers: { ...bearerHeaders(uploaderPat), 'content-type': contentType },
        payload: body,
      });
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.url).toMatch(/^\/api\/uploads\/[a-f0-9]{24}\.png$/);
      expect(json.name).toBe('photo.png');
      expect(json.type).toBe('image/png');
      expect(mockStoreFile).toHaveBeenCalledOnce();
    });

    it('returns 400 for a disallowed MIME type', async () => {
      const { body, contentType } = multipart(Buffer.from('video'), 'clip.mp4', 'video/mp4');
      const res = await app.inject({
        method: 'POST',
        url: '/api/upload',
        headers: { ...bearerHeaders(uploaderPat), 'content-type': contentType },
        payload: body,
      });
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain('not allowed');
    });

    it('returns 400 when file content does not match declared MIME type', async () => {
      // HTML content declared as image/png - verifyMimeBytes rejects it
      const htmlContent = Buffer.from('<html><body>evil</body></html>');
      const { body, contentType } = multipart(htmlContent, 'evil.png', 'image/png');
      const res = await app.inject({
        method: 'POST',
        url: '/api/upload',
        headers: { ...bearerHeaders(uploaderPat), 'content-type': contentType },
        payload: body,
      });
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain('does not match declared type');
    });

    it('returns 400 when no file is attached', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/upload',
        headers: { ...bearerHeaders(uploaderPat), 'content-type': 'multipart/form-data; boundary=empty' },
        payload: Buffer.from('--empty--\r\n'),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET /api/uploads/:filename ─────────────────────────────────────────────

  describe('GET /api/uploads/:filename', () => {
    let uploadedFilename: string;

    beforeAll(async () => {
      // Upload a real file so the DB record exists
      const { body, contentType } = multipart(pngBytes(), 'get-test.png', 'image/png');
      const res = await app.inject({
        method: 'POST',
        url: '/api/upload',
        headers: { ...bearerHeaders(uploaderPat), 'content-type': contentType },
        payload: body,
      });
      uploadedFilename = JSON.parse(res.body).url.split('/').pop();
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/uploads/${uploadedFilename}` });
      expect(res.statusCode).toBe(401);
    });

    it('returns file bytes and correct Content-Type when authenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/uploads/${uploadedFilename}`,
        cookies: cookieJar(uploaderToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('image/png');
      expect(mockGetFileBuffer).toHaveBeenCalledOnce();
    });

    it('returns 404 for a filename that has no record', async () => {
      mockGetFileBuffer.mockRejectedValueOnce(new Error('ENOENT'));
      const res = await app.inject({
        method: 'GET',
        url: '/api/uploads/doesnotexist.png',
        cookies: cookieJar(uploaderToken),
      });
      expect(res.statusCode).toBe(404);
    });

    it('strips path-traversal characters from the requested filename', async () => {
      mockGetFileBuffer.mockRejectedValueOnce(new Error('ENOENT'));
      await app.inject({
        method: 'GET',
        url: '/api/uploads/..%2F..%2Fetc%2Fpasswd',
        cookies: cookieJar(uploaderToken),
      });
      if ((mockGetFileBuffer.mock.calls as unknown[]).length > 0) {
        const call = (mockGetFileBuffer.mock.calls as unknown[][])[0];
        const calledFilename = call?.[0];
        expect(String(calledFilename)).not.toContain('..');
        expect(String(calledFilename)).not.toContain('/etc/');
      }
    });
  });

  // ── DELETE /api/uploads/:filename ──────────────────────────────────────────

  describe('DELETE /api/uploads/:filename', () => {
    let filename: string;

    beforeEach(async () => {
      // Upload a fresh file before each deletion test
      const { body, contentType } = multipart(pngBytes(), 'del-test.png', 'image/png');
      const res = await app.inject({
        method: 'POST',
        url: '/api/upload',
        headers: { ...bearerHeaders(uploaderPat), 'content-type': contentType },
        payload: body,
      });
      filename = JSON.parse(res.body).url.split('/').pop();
      mockDeleteFile.mockClear();
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await app.inject({ method: 'DELETE', url: `/api/uploads/${filename}` });
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 when a different user tries to delete the file', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/uploads/${filename}`,
        cookies: cookieJar(otherToken),
      });
      expect(res.statusCode).toBe(403);
      expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it('deletes the file and returns ok when called by the uploader', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/uploads/${filename}`,
        cookies: cookieJar(uploaderToken),
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).ok).toBe(true);
      expect(mockDeleteFile).toHaveBeenCalledOnce();
    });

    it('returns 404 for a filename that does not exist in the DB', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/uploads/nonexistent.png',
        cookies: cookieJar(uploaderToken),
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
