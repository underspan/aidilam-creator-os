/**
 * DEP-016A4 Test Suite Part 1: Chunk Planning
 * Tests for planChunks() and computeChunkChecksum()
 */
import { describe, it, expect } from 'vitest';
import { planChunks, computeChunkChecksum } from './upload-engine.js';

describe('A4.1 Chunk Planning', () => {
  it('plans exact chunks for evenly divisible file', () => {
    const chunks = planChunks(30 * 1024 * 1024, 10 * 1024 * 1024);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].byteStart).toBe(0);
    expect(chunks[0].byteEnd).toBe(10 * 1024 * 1024);
    expect(chunks[1].byteStart).toBe(10 * 1024 * 1024);
    expect(chunks[2].byteEnd).toBe(30 * 1024 * 1024);
    expect(chunks[2].isFinal).toBe(true);
    expect(chunks[0].isFinal).toBe(false);
  });

  it('plans final partial chunk correctly', () => {
    const totalBytes = 25 * 1024 * 1024;
    const chunkSize = 10 * 1024 * 1024;
    const chunks = planChunks(totalBytes, chunkSize);
    expect(chunks).toHaveLength(3);
    expect(chunks[2].size).toBe(5 * 1024 * 1024);
    expect(chunks[2].isFinal).toBe(true);
  });

  it('rejects zero-byte media', () => {
    expect(() => planChunks(0)).toThrow('Zero-byte media rejected');
  });

  it('rejects negative byte count', () => {
    expect(() => planChunks(-100)).toThrow('Zero-byte media rejected');
  });

  it('rejects chunk size below minimum (256KB)', () => {
    expect(() => planChunks(1024 * 1024, 100 * 1024)).toThrow('below minimum');
  });

  it('rejects chunk size above maximum (64MB)', () => {
    expect(() => planChunks(100 * 1024 * 1024, 128 * 1024 * 1024)).toThrow('above maximum');
  });

  it('ensures exact total-byte coverage with no gaps or overlaps', () => {
    const totalBytes = 47 * 1024 * 1024 + 12345;
    const chunks = planChunks(totalBytes, 10 * 1024 * 1024);
    let covered = 0;
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].byteStart).toBe(covered);
      covered = chunks[i].byteEnd;
      if (i > 0) expect(chunks[i].byteStart).toBe(chunks[i - 1].byteEnd);
    }
    expect(covered).toBe(totalBytes);
  });

  it('computes deterministic chunk checksum', () => {
    const data = Buffer.from('hello chunk data');
    const cs1 = computeChunkChecksum(data);
    const cs2 = computeChunkChecksum(data);
    expect(cs1).toBe(cs2);
    expect(cs1).toHaveLength(16);
  });

  it('produces unique checksums for different data', () => {
    const cs1 = computeChunkChecksum(Buffer.from('chunk-a'));
    const cs2 = computeChunkChecksum(Buffer.from('chunk-b'));
    expect(cs1).not.toBe(cs2);
  });
});
