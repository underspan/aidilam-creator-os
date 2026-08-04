/**
 * Subtitle Parsers — SRT and WebVTT
 *
 * Parses subtitle file content into normalized cue arrays.
 * Handles BOM, CRLF/LF, non-sequential numbering, multiline text,
 * NOTE/STYLE blocks (VTT), and cue identifiers (VTT).
 */

export interface ParsedCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  identifier?: string;
}

const MAX_CUES = 50000;
const MAX_CUE_TEXT_LENGTH = 4000;

/**
 * Detect subtitle format from content.
 */
export function detectSubtitleFormat(content: string): 'srt' | 'vtt' | 'unknown' {
  const stripped = stripBom(content).trimStart();
  if (stripped.startsWith('WEBVTT')) return 'vtt';
  // SRT detection: first non-empty line should be a number
  const firstLine = stripped.split(/\r?\n/)[0]?.trim();
  if (firstLine && /^\d+$/.test(firstLine)) return 'srt';
  // Try matching SRT timing pattern in first few lines
  const firstLines = stripped.split(/\r?\n/).slice(0, 5).join('\n');
  if (/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(firstLines)) return 'srt';
  return 'unknown';
}

/**
 * Parse SRT content into normalized cues.
 *
 * SRT format:
 *   <index>\n
 *   HH:MM:SS,mmm --> HH:MM:SS,mmm\n
 *   <text line 1>\n
 *   <text line 2>\n
 *   \n
 */
export function parseSrt(content: string): ParsedCue[] {
  const normalized = stripBom(content);
  const lines = normalized.split(/\r?\n/);
  const cues: ParsedCue[] = [];
  let i = 0;

  while (i < lines.length) {
    // Skip empty lines
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i >= lines.length) break;

    // Expect cue index (non-sequential allowed, we ignore the actual number)
    const indexLine = lines[i].trim();
    if (!/^\d+$/.test(indexLine)) {
      // Try to recover: look for a timing line
      if (isSrtTimingLine(lines[i])) {
        // No index line — use next sequential index
      } else {
        i++;
        continue;
      }
    } else {
      i++;
    }

    if (i >= lines.length) break;

    // Expect timing line
    const timingLine = lines[i].trim();
    if (!isSrtTimingLine(timingLine)) {
      i++;
      continue;
    }

    const timing = parseSrtTiming(timingLine);
    if (!timing) {
      i++;
      continue;
    }

    i++;

    // Collect text lines until empty line or EOF
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i]);
      i++;
    }

    const rawText = textLines.join('\n');
    const cleanText = sanitizeText(rawText);

    if (cleanText.length === 0) continue;

    if (cleanText.length > MAX_CUE_TEXT_LENGTH) {
      throw new Error(`Cue text exceeds ${MAX_CUE_TEXT_LENGTH} characters at cue ${cues.length + 1}`);
    }

    if (timing.endMs <= timing.startMs) {
      throw new Error(`Invalid timing: end (${timing.endMs}ms) must be greater than start (${timing.startMs}ms) at cue ${cues.length + 1}`);
    }

    cues.push({
      index: cues.length + 1,
      startMs: timing.startMs,
      endMs: timing.endMs,
      text: cleanText,
    });

    if (cues.length > MAX_CUES) {
      throw new Error(`Subtitle file exceeds maximum of ${MAX_CUES} cues`);
    }
  }

  return cues;
}

/**
 * Parse WebVTT content into normalized cues.
 *
 * VTT format:
 *   WEBVTT\n\n
 *   [identifier]\n
 *   HH:MM:SS.mmm --> HH:MM:SS.mmm\n
 *   <text>\n\n
 */
export function parseVtt(content: string): ParsedCue[] {
  const normalized = stripBom(content).trimStart();

  if (!normalized.startsWith('WEBVTT')) {
    throw new Error('Invalid WebVTT: missing WEBVTT header');
  }

  const lines = normalized.split(/\r?\n/);
  const cues: ParsedCue[] = [];
  let i = 1; // Skip WEBVTT line

  // Skip header content until first empty line
  while (i < lines.length && lines[i].trim() !== '') i++;

  while (i < lines.length) {
    // Skip empty lines
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i >= lines.length) break;

    // Check for NOTE block (skip until empty line)
    if (lines[i].trim().startsWith('NOTE')) {
      while (i < lines.length && lines[i].trim() !== '') i++;
      continue;
    }

    // Check for STYLE block (skip until empty line)
    if (lines[i].trim().startsWith('STYLE')) {
      while (i < lines.length && lines[i].trim() !== '') i++;
      continue;
    }

    // Check for REGION block (skip until empty line)
    if (lines[i].trim().startsWith('REGION')) {
      while (i < lines.length && lines[i].trim() !== '') i++;
      continue;
    }

    // Try to parse a cue
    let identifier: string | undefined;

    // Check if this line is a timing line or a cue identifier
    if (isVttTimingLine(lines[i])) {
      // No identifier, this is the timing line directly
    } else {
      // This might be a cue identifier
      const possibleId = lines[i].trim();
      i++;
      if (i >= lines.length) break;

      if (isVttTimingLine(lines[i])) {
        identifier = possibleId;
      } else {
        // Not a valid cue, skip
        continue;
      }
    }

    // Parse timing line
    const timingLine = lines[i].trim();
    const timing = parseVttTiming(timingLine);
    if (!timing) {
      i++;
      continue;
    }

    i++;

    // Collect text lines until empty line or EOF
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i]);
      i++;
    }

    const rawText = textLines.join('\n');
    const cleanText = sanitizeText(rawText);

    if (cleanText.length === 0) continue;

    if (cleanText.length > MAX_CUE_TEXT_LENGTH) {
      throw new Error(`Cue text exceeds ${MAX_CUE_TEXT_LENGTH} characters at cue ${cues.length + 1}`);
    }

    if (timing.endMs <= timing.startMs) {
      throw new Error(`Invalid timing: end (${timing.endMs}ms) must be greater than start (${timing.startMs}ms) at cue ${cues.length + 1}`);
    }

    cues.push({
      index: cues.length + 1,
      startMs: timing.startMs,
      endMs: timing.endMs,
      text: cleanText,
      identifier,
    });

    if (cues.length > MAX_CUES) {
      throw new Error(`Subtitle file exceeds maximum of ${MAX_CUES} cues`);
    }
  }

  return cues;
}

// =============================================================================
// Internal helpers
// =============================================================================

function stripBom(str: string): string {
  if (str.charCodeAt(0) === 0xfeff) return str.slice(1);
  return str;
}

/**
 * Sanitize text: NFC normalize, remove null bytes and control chars (keep \n).
 */
function sanitizeText(text: string): string {
  // NFC normalization
  let result = text.normalize('NFC');
  // Remove null bytes
  result = result.replace(/\0/g, '');
  // Remove control characters except newline (\n = 0x0A) and carriage return (will be stripped below)
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  // Normalize line endings
  result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return result.trim();
}

function isSrtTimingLine(line: string): boolean {
  return /\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(line);
}

function isVttTimingLine(line: string): boolean {
  return /(?:\d{2}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(?:\d{2}:)?\d{2}:\d{2}\.\d{3}/.test(line);
}

function parseSrtTiming(line: string): { startMs: number; endMs: number } | null {
  const match = line.match(
    /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
  );
  if (!match) return null;

  const startMs = timeToMs(
    parseInt(match[1], 10),
    parseInt(match[2], 10),
    parseInt(match[3], 10),
    parseInt(match[4], 10),
  );
  const endMs = timeToMs(
    parseInt(match[5], 10),
    parseInt(match[6], 10),
    parseInt(match[7], 10),
    parseInt(match[8], 10),
  );

  return { startMs, endMs };
}

function parseVttTiming(line: string): { startMs: number; endMs: number } | null {
  // VTT allows HH:MM:SS.mmm or MM:SS.mmm
  const timePattern = /(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})/;
  const match = line.match(
    new RegExp(`${timePattern.source}\\s*-->\\s*${timePattern.source}`)
  );
  if (!match) return null;

  const startMs = timeToMs(
    parseInt(match[1] || '0', 10),
    parseInt(match[2], 10),
    parseInt(match[3], 10),
    parseInt(match[4], 10),
  );
  const endMs = timeToMs(
    parseInt(match[5] || '0', 10),
    parseInt(match[6], 10),
    parseInt(match[7], 10),
    parseInt(match[8], 10),
  );

  return { startMs, endMs };
}

function timeToMs(hours: number, minutes: number, seconds: number, ms: number): number {
  return hours * 3600000 + minutes * 60000 + seconds * 1000 + ms;
}
