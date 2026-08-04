import { readFileSync } from 'node:fs';

export function readSecret(path: string): string {
  try {
    return readFileSync(path, 'utf-8').trim();
  } catch {
    throw new Error(`Secret unavailable: ${path}`);
  }
}
