import { describe, it, expect } from 'vitest';
import { parseSrt, parseVtt, detectSubtitleFormat } from './subtitle-parsers.js';

describe('subtitle-parsers', () => {
  describe('detectSubtitleFormat', () => {
    it('detects SRT format', () => {
      const content = '1\n00:00:01,000 --> 00:00:02,000\nHello\n';
      expect(detectSubtitleFormat(content)).toBe('srt');
    });

    it('detects VTT format', () => {
      const content = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n';
      expect(detectSubtitleFormat(content)).toBe('vtt');
    });

    it('detects VTT with BOM', () => {
      const content = '\uFEFFWEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n';
      expect(detectSubtitleFormat(content)).toBe('vtt');
    });

    it('returns unknown for invalid content', () => {
      const content = 'This is not a subtitle file';
      expect(detectSubtitleFormat(content)).toBe('unknown');
    });
  });

  describe('parseSrt', () => {
    it('parses basic SRT', () => {
      const content = `1
00:00:01,000 --> 00:00:04,000
Hello World

2
00:00:05,000 --> 00:00:08,000
Second cue
`;
      const cues = parseSrt(content);
      expect(cues).toHaveLength(2);
      expect(cues[0]).toEqual({
        index: 1,
        startMs: 1000,
        endMs: 4000,
        text: 'Hello World',
      });
      expect(cues[1]).toEqual({
        index: 2,
        startMs: 5000,
        endMs: 8000,
        text: 'Second cue',
      });
    });

    it('parses multiline cue text', () => {
      const content = `1
00:00:01,000 --> 00:00:04,000
Line one
Line two
Line three

`;
      const cues = parseSrt(content);
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Line one\nLine two\nLine three');
    });

    it('handles BOM', () => {
      const content = '\uFEFF1\n00:00:01,000 --> 00:00:04,000\nHello\n';
      const cues = parseSrt(content);
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Hello');
    });

    it('handles CRLF line endings', () => {
      const content = '1\r\n00:00:01,000 --> 00:00:04,000\r\nHello\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,000\r\nWorld\r\n';
      const cues = parseSrt(content);
      expect(cues).toHaveLength(2);
      expect(cues[0].text).toBe('Hello');
      expect(cues[1].text).toBe('World');
    });

    it('handles non-sequential cue numbers', () => {
      const content = `5
00:00:01,000 --> 00:00:04,000
First

10
00:00:05,000 --> 00:00:08,000
Second

3
00:00:09,000 --> 00:00:12,000
Third
`;
      const cues = parseSrt(content);
      expect(cues).toHaveLength(3);
      // Index should be re-numbered sequentially
      expect(cues[0].index).toBe(1);
      expect(cues[1].index).toBe(2);
      expect(cues[2].index).toBe(3);
    });

    it('rejects cue where end <= start', () => {
      const content = `1
00:00:05,000 --> 00:00:03,000
Bad timing
`;
      expect(() => parseSrt(content)).toThrow('Invalid timing');
    });

    it('rejects cue text exceeding 4000 chars', () => {
      const longText = 'A'.repeat(4001);
      const content = `1\n00:00:01,000 --> 00:00:04,000\n${longText}\n`;
      expect(() => parseSrt(content)).toThrow('exceeds');
    });

    it('rejects more than 50000 cues', () => {
      // Generate 50001 cues
      const lines: string[] = [];
      for (let i = 1; i <= 50001; i++) {
        const startSec = i;
        const endSec = i + 1;
        const startH = String(Math.floor(startSec / 3600)).padStart(2, '0');
        const startM = String(Math.floor((startSec % 3600) / 60)).padStart(2, '0');
        const startS = String(startSec % 60).padStart(2, '0');
        const endH = String(Math.floor(endSec / 3600)).padStart(2, '0');
        const endM = String(Math.floor((endSec % 3600) / 60)).padStart(2, '0');
        const endS = String(endSec % 60).padStart(2, '0');
        lines.push(`${i}`);
        lines.push(`${startH}:${startM}:${startS},000 --> ${endH}:${endM}:${endS},000`);
        lines.push(`Cue ${i}`);
        lines.push('');
      }
      const content = lines.join('\n');
      expect(() => parseSrt(content)).toThrow('exceeds maximum');
    });

    it('preserves Unicode text (NFC normalized)', () => {
      // Vietnamese text with combining characters
      const content = `1
00:00:01,000 --> 00:00:04,000
Xin chào thế giới

2
00:00:05,000 --> 00:00:08,000
中文字幕测试
`;
      const cues = parseSrt(content);
      expect(cues).toHaveLength(2);
      expect(cues[0].text).toBe('Xin chào thế giới');
      expect(cues[1].text).toBe('中文字幕测试');
      // NFC normalized
      expect(cues[0].text).toBe(cues[0].text.normalize('NFC'));
    });

    it('removes null bytes and control characters', () => {
      const content = `1\n00:00:01,000 --> 00:00:04,000\nHello\x00World\x01!\n`;
      const cues = parseSrt(content);
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('HelloWorld!');
    });
  });

  describe('parseVtt', () => {
    it('parses basic WebVTT', () => {
      const content = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello World

00:00:05.000 --> 00:00:08.000
Second cue
`;
      const cues = parseVtt(content);
      expect(cues).toHaveLength(2);
      expect(cues[0]).toEqual({
        index: 1,
        startMs: 1000,
        endMs: 4000,
        text: 'Hello World',
        identifier: undefined,
      });
    });

    it('rejects content without WEBVTT header', () => {
      const content = '00:00:01.000 --> 00:00:04.000\nHello\n';
      expect(() => parseVtt(content)).toThrow('missing WEBVTT header');
    });

    it('skips NOTE blocks', () => {
      const content = `WEBVTT

NOTE
This is a comment that should be ignored

00:00:01.000 --> 00:00:04.000
Hello

NOTE Another comment

00:00:05.000 --> 00:00:08.000
World
`;
      const cues = parseVtt(content);
      expect(cues).toHaveLength(2);
      expect(cues[0].text).toBe('Hello');
      expect(cues[1].text).toBe('World');
    });

    it('skips STYLE blocks', () => {
      const content = `WEBVTT

STYLE
::cue { color: white; }

00:00:01.000 --> 00:00:04.000
Styled text
`;
      const cues = parseVtt(content);
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Styled text');
    });

    it('parses cue identifiers', () => {
      const content = `WEBVTT

intro-1
00:00:01.000 --> 00:00:04.000
Hello World

outro-1
00:00:05.000 --> 00:00:08.000
Goodbye
`;
      const cues = parseVtt(content);
      expect(cues).toHaveLength(2);
      expect(cues[0].identifier).toBe('intro-1');
      expect(cues[1].identifier).toBe('outro-1');
    });

    it('supports MM:SS.mmm format (no hours)', () => {
      const content = `WEBVTT

01:30.000 --> 02:00.000
Short format timing
`;
      const cues = parseVtt(content);
      expect(cues).toHaveLength(1);
      expect(cues[0].startMs).toBe(90000); // 1:30 = 90s
      expect(cues[0].endMs).toBe(120000); // 2:00 = 120s
    });

    it('handles HH:MM:SS.mmm format', () => {
      const content = `WEBVTT

01:30:00.500 --> 01:30:05.000
Long format
`;
      const cues = parseVtt(content);
      expect(cues).toHaveLength(1);
      expect(cues[0].startMs).toBe(5400500); // 1h30m0.5s
      expect(cues[0].endMs).toBe(5405000); // 1h30m5s
    });

    it('rejects invalid timing (end <= start)', () => {
      const content = `WEBVTT

00:00:05.000 --> 00:00:03.000
Bad
`;
      expect(() => parseVtt(content)).toThrow('Invalid timing');
    });

    it('preserves Unicode in VTT', () => {
      const content = `WEBVTT

00:00:01.000 --> 00:00:04.000
Tiếng Việt

00:00:05.000 --> 00:00:08.000
日本語テスト
`;
      const cues = parseVtt(content);
      expect(cues).toHaveLength(2);
      expect(cues[0].text).toBe('Tiếng Việt');
      expect(cues[1].text).toBe('日本語テスト');
    });
  });
});
