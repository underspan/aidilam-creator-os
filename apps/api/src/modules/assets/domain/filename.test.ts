import { describe, it, expect } from 'vitest';
import { sanitizeFilename, generateObjectKey } from './filename.js';

describe('sanitizeFilename', () => {
  it('passes through normal filenames', () => {
    expect(sanitizeFilename('video.mp4')).toBe('video.mp4');
    expect(sanitizeFilename('my-photo.jpeg')).toBe('my-photo.jpeg');
    expect(sanitizeFilename('document_v2.pdf')).toBe('document_v2.pdf');
  });

  it('removes path traversal sequences', () => {
    expect(sanitizeFilename('../../secret.mp4')).toBe('secret.mp4');
    expect(sanitizeFilename('../../../etc/passwd')).toBe('etcpasswd');
    expect(sanitizeFilename('foo/../../bar.txt')).toBe('foobar.txt');
  });

  it('removes absolute path components', () => {
    expect(sanitizeFilename('/etc/passwd')).toBe('etcpasswd');
    expect(sanitizeFilename('/root/secret.key')).toBe('rootsecret.key');
  });

  it('removes Windows drive prefixes', () => {
    expect(sanitizeFilename('C:\\Windows\\system32\\file.exe')).toBe('Windowssystem32file.exe');
    expect(sanitizeFilename('D:\\data.mp4')).toBe('data.mp4');
  });

  it('removes null bytes', () => {
    expect(sanitizeFilename('file\x00name.mp4')).toBe('filename.mp4');
    expect(sanitizeFilename('\x00\x00test.txt')).toBe('test.txt');
  });

  it('removes dotfiles (leading dots)', () => {
    expect(sanitizeFilename('.htaccess')).toBe('htaccess');
    expect(sanitizeFilename('.env')).toBe('env');
    expect(sanitizeFilename('...hidden.txt')).toBe('hidden.txt');
  });

  it('truncates very long filenames while preserving extension', () => {
    const longName = 'a'.repeat(300) + '.mp4';
    const result = sanitizeFilename(longName);
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result).toMatch(/\.mp4$/);
  });

  it('handles Unicode filenames with NFC normalization', () => {
    // Composed vs decomposed form
    const composed = '\u00e9'; // é (single codepoint)
    const decomposed = '\u0065\u0301'; // e + combining acute accent
    expect(sanitizeFilename(`caf${composed}.txt`)).toBe(sanitizeFilename(`caf${decomposed}.txt`));
  });

  it('preserves valid Unicode characters', () => {
    expect(sanitizeFilename('日本語ファイル.mp4')).toBe('日本語ファイル.mp4');
    expect(sanitizeFilename('тест.txt')).toBe('тест.txt');
  });

  it('returns unnamed for empty input', () => {
    expect(sanitizeFilename('')).toBe('unnamed');
  });

  it('returns unnamed for input that is only unsafe characters', () => {
    expect(sanitizeFilename('***')).toBe('unnamed');
    expect(sanitizeFilename('...')).toBe('unnamed');
  });

  it('preserves and lowercases extension', () => {
    expect(sanitizeFilename('Photo.JPEG')).toBe('Photo.jpeg');
    expect(sanitizeFilename('VIDEO.MP4')).toBe('VIDEO.mp4');
    expect(sanitizeFilename('file.TXT')).toBe('file.txt');
  });

  it('replaces unsafe characters with dashes', () => {
    expect(sanitizeFilename('file name (1).mp4')).toBe('file-name-1.mp4');
    expect(sanitizeFilename('a<b>c.txt')).toBe('a-b-c.txt');
  });

  it('collapses multiple dashes', () => {
    expect(sanitizeFilename('a---b.mp4')).toBe('a-b.mp4');
    expect(sanitizeFilename('foo   bar.txt')).toBe('foo-bar.txt');
  });

  it('removes control characters', () => {
    expect(sanitizeFilename('file\x01\x02name.mp4')).toBe('filename.mp4');
    expect(sanitizeFilename('\x1btest.txt')).toBe('test.txt');
  });
});

describe('generateObjectKey', () => {
  it('generates correct object key path', () => {
    const result = generateObjectKey(
      'proj-123',
      'asset-456',
      'video.mp4',
    );
    expect(result).toBe('projects/proj-123/assets/asset-456/source/video.mp4');
  });

  it('uses the sanitized filename as-is', () => {
    const result = generateObjectKey(
      'abc-def',
      'ghi-jkl',
      'my-file.jpeg',
    );
    expect(result).toBe('projects/abc-def/assets/ghi-jkl/source/my-file.jpeg');
  });
});
