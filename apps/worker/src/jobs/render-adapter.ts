/**
 * FFmpeg Render Adapter
 * Encapsulates all FFmpeg render operations behind the Provider Adapter interface.
 */
import { execFileSync } from 'node:child_process';

const FFMPEG_PATH = '/usr/bin/ffmpeg';
const FFPROBE_PATH = '/usr/bin/ffprobe';

export class FfmpegRenderAdapter {
  public readonly code = 'ffmpeg';

  extractAudio(sourcePath: string, outputPath: string): void {
    execFileSync(FFMPEG_PATH, ['-y', '-i', sourcePath, '-ar', '16000', '-ac', '1', '-f', 'wav', outputPath], { timeout: 60000 });
  }

  concatenateAudio(inputs: string[], outputPath: string): void {
    const concatInputs = inputs.flatMap(p => ['-i', p]);
    const filterComplex = inputs.map((_, i) => `[${i}:a]`).join('') + `concat=n=${inputs.length}:v=0:a=1[out]`;
    execFileSync(FFMPEG_PATH, ['-y', ...concatInputs, '-filter_complex', filterComplex, '-map', '[out]', outputPath], { timeout: 60000 });
  }

  renderPortraitVideo(opts: {
    sourcePath: string;
    narrationPath: string;
    assPath: string;
    outputPath: string;
    width: number;
    height: number;
    duration: number;
  }): void {
    execFileSync(FFMPEG_PATH, [
      '-y', '-i', opts.sourcePath, '-i', opts.narrationPath,
      '-filter_complex',
      `[0:v]scale=${opts.width}:${opts.height}:force_original_aspect_ratio=decrease,pad=${opts.width}:${opts.height}:(ow-iw)/2:(oh-ih)/2:black,ass=${opts.assPath}[vout];[0:a]volume=0.15[bg];[1:a]aresample=48000[narr];[bg][narr]amix=inputs=2:duration=longest:dropout_transition=2[aout]`,
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
      '-movflags', '+faststart',
      '-t', String(opts.duration),
      opts.outputPath,
    ], { timeout: 300000 });
  }

  generateThumbnail(videoPath: string, outputPath: string): void {
    execFileSync(FFMPEG_PATH, ['-y', '-i', videoPath, '-vf', 'select=eq(n\\,30)', '-vframes', '1', outputPath], { timeout: 10000 });
  }

  probe(videoPath: string): any {
    const output = execFileSync(FFPROBE_PATH, ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', videoPath], { encoding: 'utf-8' });
    return JSON.parse(output);
  }
}
