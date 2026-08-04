import { randomUUID } from 'node:crypto';

const MAX_ID_LENGTH = 128;
const VALID_ID = /^[a-zA-Z0-9._-]+$/;

export function resolveRequestId(incoming?: string): string {
  if (incoming && incoming.length <= MAX_ID_LENGTH && VALID_ID.test(incoming)) {
    return incoming;
  }
  return randomUUID();
}
