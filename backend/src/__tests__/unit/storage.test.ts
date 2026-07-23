/**
 * Unit tests for the storage utility module.
 *
 * verifyMimeBytes  — guards against MIME spoofing by comparing magic bytes to the declared type.
 * fileExtFromMime / mimeFromExt — bidirectional MIME ↔ extension mapping.
 * generateFilename — deterministic content-hash-based filename to prevent collisions.
 * storeFile / getFileBuffer / deleteFile — local disk and S3 storage modes.
 *
 * All FS calls and S3 SDK calls are mocked; no actual files are written.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  verifyMimeBytes,
  fileExtFromMime,
  mimeFromExt,
  generateFilename,
  storeFile,
  getFileBuffer,
  deleteFile,
} from '../../utils/storage';

// Mocked for local-disk tests. S3 tests use vi.resetModules() + vi.doMock + dynamic import.
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from('disk-content')),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

// ── Magic byte helpers ─────────────────────────────────────────────────────

function jpegBuf() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
}
function pngBuf() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
}
function gifBuf() {
  return Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
}
function webpBuf() {
  const b = Buffer.alloc(16);
  b[0] = 0x52;
  b[1] = 0x49;
  b[2] = 0x46;
  b[3] = 0x46;
  b[8] = 0x57;
  b[9] = 0x45;
  b[10] = 0x42;
  b[11] = 0x50;
  return b;
}
function pdfBuf() {
  return Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
}
function zipBuf() {
  return Buffer.from([0x50, 0x4b, 0x03, 0x04]);
}
function docBuf() {
  return Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]);
}
function htmlBuf() {
  return Buffer.from('<html><body></body></html>');
}

// ── verifyMimeBytes ────────────────────────────────────────────────────────

describe('verifyMimeBytes', () => {
  it('accepts JPEG with correct magic bytes', () => {
    expect(verifyMimeBytes(jpegBuf(), 'image/jpeg')).toBe(true);
  });

  it('rejects HTML disguised as JPEG', () => {
    expect(verifyMimeBytes(htmlBuf(), 'image/jpeg')).toBe(false);
  });

  it('accepts PNG with correct magic bytes', () => {
    expect(verifyMimeBytes(pngBuf(), 'image/png')).toBe(true);
  });

  it('rejects JPEG bytes declared as PNG', () => {
    expect(verifyMimeBytes(jpegBuf(), 'image/png')).toBe(false);
  });

  it('accepts GIF with correct magic bytes', () => {
    expect(verifyMimeBytes(gifBuf(), 'image/gif')).toBe(true);
  });

  it('accepts WebP with correct magic bytes', () => {
    expect(verifyMimeBytes(webpBuf(), 'image/webp')).toBe(true);
  });

  // RIFF alone isn't enough; the "WEBP" marker at offset 8 must also be present
  it('rejects WebP when RIFF header is correct but WEBP marker is missing', () => {
    const b = webpBuf();
    b[8] = 0x00; // corrupt WEBP marker
    expect(verifyMimeBytes(b, 'image/webp')).toBe(false);
  });

  it('accepts PDF with correct magic bytes', () => {
    expect(verifyMimeBytes(pdfBuf(), 'application/pdf')).toBe(true);
  });

  it('accepts ZIP with correct magic bytes', () => {
    expect(verifyMimeBytes(zipBuf(), 'application/zip')).toBe(true);
  });

  // Office Open XML formats are ZIP archives; the ZIP signature is the correct check
  it('accepts DOCX (ZIP-family) with ZIP magic bytes', () => {
    const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(verifyMimeBytes(zipBuf(), mime)).toBe(true);
  });

  it('accepts XLSX (ZIP-family) with ZIP magic bytes', () => {
    const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    expect(verifyMimeBytes(zipBuf(), mime)).toBe(true);
  });

  it('accepts legacy .doc with OLE2 magic bytes', () => {
    expect(verifyMimeBytes(docBuf(), 'application/msword')).toBe(true);
  });

  it('accepts legacy .xls with OLE2 magic bytes', () => {
    expect(verifyMimeBytes(docBuf(), 'application/vnd.ms-excel')).toBe(true);
  });

  // Text types have no reliable magic bytes; they pass through the check unconditionally
  it('always accepts text/plain (no magic bytes for text)', () => {
    expect(verifyMimeBytes(Buffer.from('hello world'), 'text/plain')).toBe(true);
  });

  it('always accepts text/csv', () => {
    expect(verifyMimeBytes(Buffer.from('a,b,c'), 'text/csv')).toBe(true);
  });

  it('always accepts application/json', () => {
    expect(verifyMimeBytes(Buffer.from('{"key":1}'), 'application/json')).toBe(true);
  });

  // Truncated uploads must be rejected rather than causing an out-of-bounds read
  it('rejects buffer shorter than 4 bytes for binary types', () => {
    expect(verifyMimeBytes(Buffer.from([0xff, 0xd8]), 'image/jpeg')).toBe(false);
  });

  it('returns false for unknown MIME types', () => {
    expect(verifyMimeBytes(Buffer.from([0x00, 0x01, 0x02, 0x03]), 'application/unknown')).toBe(false);
  });
});

// ── fileExtFromMime ────────────────────────────────────────────────────────

describe('fileExtFromMime', () => {
  it('returns the correct extension for known MIME types', () => {
    expect(fileExtFromMime('image/jpeg')).toBe('jpg');
    expect(fileExtFromMime('image/png')).toBe('png');
    expect(fileExtFromMime('application/pdf')).toBe('pdf');
    expect(fileExtFromMime('text/csv')).toBe('csv');
  });

  it('returns null for unknown MIME types', () => {
    expect(fileExtFromMime('application/unknown')).toBeNull();
  });
});

// ── mimeFromExt ────────────────────────────────────────────────────────────

describe('mimeFromExt', () => {
  it('returns the correct MIME type for known extensions', () => {
    expect(mimeFromExt('jpg')).toBe('image/jpeg');
    expect(mimeFromExt('jpeg')).toBe('image/jpeg');
    expect(mimeFromExt('png')).toBe('image/png');
    expect(mimeFromExt('pdf')).toBe('application/pdf');
  });

  it('returns application/octet-stream for unknown extensions', () => {
    expect(mimeFromExt('xyz')).toBe('application/octet-stream');
  });
});

// ── generateFilename ───────────────────────────────────────────────────────

describe('generateFilename', () => {
  it('produces a YYYYMMDD-HHmmss-mmm_name.ext pattern', () => {
    const name = generateFilename('My Report.pdf', 'pdf');
    expect(name).toMatch(/^\d{8}-\d{6}-\d{3}_[\w-]+\.pdf$/);
  });

  it('sanitizes spaces and special characters in the original name', () => {
    const name = generateFilename('hello world! (2).txt', 'txt');
    expect(name).toContain('hello-world-2');
  });

  it('strips the original extension from the base name', () => {
    const name = generateFilename('photo.jpeg', 'jpg');
    expect(name).not.toContain('jpeg_');
    expect(name).toMatch(/\.jpg$/);
  });

  it('falls back to "file" when the original name is empty or only special chars', () => {
    expect(generateFilename('', 'png')).toContain('_file.');
    expect(generateFilename('!!!', 'png')).toContain('_file.');
  });
});

// ── local disk storage ─────────────────────────────────────────────────────

describe('local disk storage (no AWS_S3_BUCKET)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('storeFile creates the uploads dir and writes the buffer', async () => {
    const { mkdir, writeFile } = await import('fs/promises');
    await storeFile(Buffer.from('data'), 'test.png', 'image/png');
    expect(mkdir).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledOnce();
    const call = ((writeFile as ReturnType<typeof vi.fn>).mock.calls as unknown[][])[0];
    expect(String(call?.[0])).toContain('test.png');
  });

  it('getFileBuffer reads from the uploads directory', async () => {
    const buf = await getFileBuffer('test.png');
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.toString()).toBe('disk-content');
  });

  it('deleteFile unlinks from the uploads directory', async () => {
    const { unlink } = await import('fs/promises');
    await deleteFile('test.png');
    expect(unlink).toHaveBeenCalledOnce();
  });

  it('deleteFile sanitizes path traversal characters before unlinking', async () => {
    const { unlink } = await import('fs/promises');
    vi.clearAllMocks();
    await deleteFile('../../../etc/passwd');
    const unlinkCall = ((unlink as ReturnType<typeof vi.fn>).mock.calls as unknown[][])[0];
    expect(String(unlinkCall?.[0])).not.toContain('..');
    expect(String(unlinkCall?.[0])).not.toContain('/etc/passwd');
  });

  it('getFileBuffer sanitizes path traversal before reading', async () => {
    const { readFile } = await import('fs/promises');
    vi.clearAllMocks();
    await getFileBuffer('../../../etc/passwd');
    const readCall = ((readFile as ReturnType<typeof vi.fn>).mock.calls as unknown[][])[0];
    expect(String(readCall?.[0])).not.toContain('..');
  });
});

// ── S3 storage mode ────────────────────────────────────────────────────────

describe('S3 storage mode (AWS_S3_BUCKET set)', () => {
  const mockSend = vi.fn();

  beforeEach(() => {
    mockSend.mockReset();
    vi.resetModules();
    process.env.AWS_S3_BUCKET = 'test-bucket';
    process.env.AWS_S3_PREFIX = 'pfx';
    vi.doMock('@aws-sdk/client-s3', () => ({
      // All must be regular functions (not arrow) because storage.ts uses `new` on each
      S3Client: function MockS3Client(this: unknown) {
        return { send: mockSend };
      },
      PutObjectCommand: function MockPut(this: unknown, input: unknown) {
        return { _cmd: 'PUT', ...(input as object) };
      },
      GetObjectCommand: function MockGet(this: unknown, input: unknown) {
        return { _cmd: 'GET', ...(input as object) };
      },
      DeleteObjectCommand: function MockDelete(this: unknown, input: unknown) {
        return { _cmd: 'DELETE', ...(input as object) };
      },
    }));
  });

  afterEach(() => {
    delete process.env.AWS_S3_BUCKET;
    delete process.env.AWS_S3_PREFIX;
    vi.resetModules();
  });

  it('storeFile sends PutObjectCommand with correct bucket, key, and content-type', async () => {
    mockSend.mockResolvedValueOnce({});
    const { storeFile: s3Store } = await import('../../utils/storage');
    await s3Store(Buffer.from('img-data'), 'photo.jpg', 'image/jpeg');
    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = (mockSend.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>;
    expect(cmd._cmd).toBe('PUT');
    expect(cmd.Bucket).toBe('test-bucket');
    expect(cmd.Key).toBe('pfx/photo.jpg');
    expect(cmd.ContentType).toBe('image/jpeg');
  });

  it('getFileBuffer sends GetObjectCommand and reassembles streamed chunks', async () => {
    async function* stream() {
      yield Buffer.from('chunk1');
      yield Buffer.from('chunk2');
    }
    mockSend.mockResolvedValueOnce({ Body: stream() });
    const { getFileBuffer: s3Get } = await import('../../utils/storage');
    const buf = await s3Get('photo.jpg');
    expect(buf.toString()).toBe('chunk1chunk2');
    const cmd = (mockSend.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>;
    expect(cmd._cmd).toBe('GET');
    expect(cmd.Bucket).toBe('test-bucket');
    expect(cmd.Key).toBe('pfx/photo.jpg');
  });

  it('deleteFile sends DeleteObjectCommand with correct key', async () => {
    mockSend.mockResolvedValueOnce({});
    const { deleteFile: s3Delete } = await import('../../utils/storage');
    await s3Delete('photo.jpg');
    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = (mockSend.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>;
    expect(cmd._cmd).toBe('DELETE');
    expect(cmd.Bucket).toBe('test-bucket');
    expect(cmd.Key).toBe('pfx/photo.jpg');
  });

  it('getFileBuffer sanitizes path traversal before building the S3 key', async () => {
    async function* stream() {
      yield Buffer.from('data');
    }
    mockSend.mockResolvedValueOnce({ Body: stream() });
    const { getFileBuffer: s3Get } = await import('../../utils/storage');
    await s3Get('../../../etc/passwd.txt');
    const cmd = (mockSend.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>;
    expect(cmd.Key).not.toContain('..');
    expect(cmd.Key).not.toContain('/etc/');
  });

  it('deleteFile sanitizes path traversal before building the S3 key', async () => {
    mockSend.mockResolvedValueOnce({});
    const { deleteFile: s3Delete } = await import('../../utils/storage');
    await s3Delete('../../../etc/passwd.txt');
    const cmd = (mockSend.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>;
    expect(cmd.Key).not.toContain('..');
  });

  it('uses AWS_S3_PREFIX as the key prefix', async () => {
    mockSend.mockResolvedValueOnce({});
    process.env.AWS_S3_PREFIX = 'custom-prefix';
    vi.resetModules();
    vi.doMock('@aws-sdk/client-s3', () => ({
      S3Client: function MockS3Client(this: unknown) {
        return { send: mockSend };
      },
      PutObjectCommand: function MockPut(this: unknown, input: unknown) {
        return { _cmd: 'PUT', ...(input as object) };
      },
    }));
    const { storeFile: s3Store } = await import('../../utils/storage');
    await s3Store(Buffer.from('x'), 'file.txt', 'text/plain');
    const cmd = (mockSend.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>;
    expect(cmd.Key).toMatch(/^custom-prefix\//);
  });
});
