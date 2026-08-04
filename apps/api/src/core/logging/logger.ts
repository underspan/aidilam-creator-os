const REDACT_PATTERNS = /password|secret|token|api.?key|authorization|cookie/i;

export function redactValue(key: string, value: unknown): unknown {
  if (typeof key === 'string' && REDACT_PATTERNS.test(key)) return '[REDACTED]';
  return value;
}

export const logger = {
  info: (msg: string, data?: Record<string, unknown>) => {
    console.log(JSON.stringify({ level: 'info', msg, ts: new Date().toISOString(), ...sanitize(data) }));
  },
  error: (msg: string, data?: Record<string, unknown>) => {
    console.error(JSON.stringify({ level: 'error', msg, ts: new Date().toISOString(), ...sanitize(data) }));
  },
  warn: (msg: string, data?: Record<string, unknown>) => {
    console.warn(JSON.stringify({ level: 'warn', msg, ts: new Date().toISOString(), ...sanitize(data) }));
  },
};

function sanitize(data?: Record<string, unknown>): Record<string, unknown> {
  if (!data) return {};
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    result[k] = redactValue(k, v);
  }
  return result;
}
