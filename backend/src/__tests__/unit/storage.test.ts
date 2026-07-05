import { describe, it, expect } from 'vitest';
import { verifyMimeBytes, fileExtFromMime, mimeFromExt } from '../../utils/storage';

// ── Magic byte helpers ─────────────────────────────────────────────────────

function jpegBuf()  { return Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]); }
function pngBuf()   { return Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]); }
function gifBuf()   { return Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); }
function webpBuf() {
  const b = Buffer.alloc(16);
  b[0]=0x52; b[1]=0x49; b[2]=0x46; b[3]=0x46;
  b[8]=0x57; b[9]=0x45; b[10]=0x42; b[11]=0x50;
  return b;
}
function pdfBuf()   { return Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]); }
function zipBuf()   { return Buffer.from([0x50, 0x4B, 0x03, 0x04]); }
function docBuf()   { return Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1]); }
function htmlBuf()  { return Buffer.from('<html><body></body></html>'); }

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

  it('always accepts text/plain (no magic bytes for text)', () => {
    expect(verifyMimeBytes(Buffer.from('hello world'), 'text/plain')).toBe(true);
  });

  it('always accepts text/csv', () => {
    expect(verifyMimeBytes(Buffer.from('a,b,c'), 'text/csv')).toBe(true);
  });

  it('always accepts application/json', () => {
    expect(verifyMimeBytes(Buffer.from('{"key":1}'), 'application/json')).toBe(true);
  });

  it('rejects buffer shorter than 4 bytes for binary types', () => {
    expect(verifyMimeBytes(Buffer.from([0xFF, 0xD8]), 'image/jpeg')).toBe(false);
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
